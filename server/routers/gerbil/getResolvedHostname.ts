import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { resolveExitNodes } from "@server/lib/exitNodes";
import config from "@server/lib/config";
import { build } from "@server/build";

// Define Zod schema for request validation
const getResolvedHostnameSchema = z.object({
    hostname: z.string(),
    publicKey: z.string()
});

export async function getResolvedHostname(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        let endpoints: string[] = []; // always route locally

        if (build != "oss") {
            // Validate request parameters
            const parsedParams = getResolvedHostnameSchema.safeParse(req.body);
            if (!parsedParams.success) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        fromError(parsedParams.error).toString()
                    )
                );
            }

            const { hostname, publicKey } = parsedParams.data;

            const baseDomain = config.getRawPrivateConfig().app.base_domain;

            // if the hostname ends with the base domain then send back a empty array
            if (baseDomain && hostname.endsWith(baseDomain)) {
                return res.status(HttpCode.OK).send({
                    endpoints: [] // this should force to route locally
                });
            }

            const resourceExitNodes = await resolveExitNodes(
                hostname,
                publicKey
            );

            endpoints = resourceExitNodes.map((node) => node.endpoint);
        }

        // return the endpoints
        return res.status(HttpCode.OK).send({
            endpoints
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred..."
            )
        );
    }
}
