import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, resourceHeaderAuth } from "@server/db";
import { eq } from "drizzle-orm";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import { response } from "@server/lib/response";
import logger from "@server/logger";
import { hashPassword } from "@server/auth/password";
import { OpenAPITags, registry } from "@server/openApi";

const setResourceAuthMethodsParamsSchema = z.object({
    resourceId: z.string().transform(Number).pipe(z.number().int().positive())
});

const setResourceAuthMethodsBodySchema = z
    .object({
        user: z.string().min(4).max(100).nullable(),
        password: z.string().min(4).max(100).nullable()
    })
    .strict();

registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}/header-auth",
    description:
        "Set or update the header authentication for a resource. If user and password is not provided, it will remove the header authentication.",
    tags: [OpenAPITags.Resource],
    request: {
        params: setResourceAuthMethodsParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: setResourceAuthMethodsBodySchema
                }
            }
        }
    },
    responses: {}
});

export async function setResourceHeaderAuth(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = setResourceAuthMethodsParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = setResourceAuthMethodsBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;
        const { user, password } = parsedBody.data;

        await db.transaction(async (trx) => {
            await trx
                .delete(resourceHeaderAuth)
                .where(eq(resourceHeaderAuth.resourceId, resourceId));

            if (user && password) {
                const headerAuthHash = await hashPassword(Buffer.from(`${user}:${password}`).toString("base64"));

                await trx
                    .insert(resourceHeaderAuth)
                    .values({ resourceId, headerAuthHash });
            }
        });

        return response(res, {
            data: {},
            success: true,
            error: false,
            message: "Header Authentication set successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
