import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { Org, orgs } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const getOrgSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

export type GetOrgResponse = {
    org: Org & { settings: { } | null };
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}",
    description: "Get an organization",
    tags: [OpenAPITags.Org],
    request: {
        params: getOrgSchema
    },
    responses: {}
});

export async function getOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getOrgSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const { orgId } = parsedParams.data;

        const org = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (org.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }

        // Parse settings from JSON string back to object
        let parsedSettings = null;
        if (org[0].settings) {
            try {
                parsedSettings = JSON.parse(org[0].settings);
            } catch (error) {
                // If parsing fails, keep as string for backward compatibility
                parsedSettings = org[0].settings;
            }
        }

        return response<GetOrgResponse>(res, {
            data: {
                org: {
                    ...org[0],
                    settings: parsedSettings
                }
            },
            success: true,
            error: false,
            message: "Organization retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
