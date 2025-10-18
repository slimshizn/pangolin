import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { orgs } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const updateOrgParamsSchema = z
    .object({
        orgId: z.string(),
    })
    .strict();

const updateOrgBodySchema = z
    .object({
        name: z.string().min(1).max(255).optional(),
        settings: z.object({
        }).optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    });

registry.registerPath({
    method: "post",
    path: "/org/{orgId}",
    description: "Update an organization",
    tags: [OpenAPITags.Org],
    request: {
        params: updateOrgParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateOrgBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function updateOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = updateOrgParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = updateOrgBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        const settings = parsedBody.data.settings ? JSON.stringify(parsedBody.data.settings) : undefined;

        const updatedOrg = await db
            .update(orgs)
            .set({
                name: parsedBody.data.name,
                settings: settings
            })
            .where(eq(orgs.orgId, orgId))
            .returning();

        if (updatedOrg.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }

        return response(res, {
            data: updatedOrg[0],
            success: true,
            error: false,
            message: "Organization updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
