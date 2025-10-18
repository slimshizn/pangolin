import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import license from "#private/license/license";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const bodySchema = z
    .object({
        licenseKey: z.string().min(1).max(255)
    })
    .strict();

export async function activateLicense(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { licenseKey } = parsedBody.data;

        try {
            const status = await license.activateLicenseKey(licenseKey);
            return sendResponse(res, {
                data: status,
                success: true,
                error: false,
                message: "License key activated successfully",
                status: HttpCode.OK
            });
        } catch (e) {
            logger.error(e);
            return next(
                createHttpError(HttpCode.INTERNAL_SERVER_ERROR, `${e}`)
            );
        }
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
