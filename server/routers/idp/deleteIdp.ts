import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { idp, idpOidcConfig, idpOrg } from "@server/db";
import { eq } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";

const paramsSchema = z
    .object({
        orgId: z.string().optional(), // Optional; used with org idp in saas
        idpId: z.coerce.number()
    })
    .strict();

registry.registerPath({
    method: "delete",
    path: "/idp/{idpId}",
    description: "Delete IDP.",
    tags: [OpenAPITags.Idp],
    request: {
        params: paramsSchema
    },
    responses: {}
});

export async function deleteIdp(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { idpId } = parsedParams.data;

        // Check if IDP exists
        const [existingIdp] = await db
            .select()
            .from(idp)
            .where(eq(idp.idpId, idpId));

        if (!existingIdp) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "IdP not found"
                )
            );
        }

        // Delete the IDP and its related records in a transaction
        await db.transaction(async (trx) => {
            // Delete OIDC config if it exists
            await trx
                .delete(idpOidcConfig)
                .where(eq(idpOidcConfig.idpId, idpId));

            // Delete IDP-org mappings
            await trx
                .delete(idpOrg)
                .where(eq(idpOrg.idpId, idpId));

            // Delete the IDP itself
            await trx
                .delete(idp)
                .where(eq(idp.idpId, idpId));
        });

        return response<null>(res, {
            data: null,
            success: true,
            error: false,
            message: "IdP deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
