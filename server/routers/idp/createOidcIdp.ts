import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { idp, idpOidcConfig, idpOrg, orgs } from "@server/db";
import { generateOidcRedirectUrl } from "@server/lib/idp/generateRedirectUrl";
import { encrypt } from "@server/lib/crypto";
import config from "@server/lib/config";
import license from "@server/license/license";

const paramsSchema = z.object({}).strict();

const bodySchema = z
    .object({
        name: z.string().nonempty(),
        clientId: z.string().nonempty(),
        clientSecret: z.string().nonempty(),
        authUrl: z.string().url(),
        tokenUrl: z.string().url(),
        identifierPath: z.string().nonempty(),
        emailPath: z.string().optional(),
        namePath: z.string().optional(),
        scopes: z.string().nonempty(),
        autoProvision: z.boolean().optional()
    })
    .strict();

export type CreateIdpResponse = {
    idpId: number;
    redirectUrl: string;
};

registry.registerPath({
    method: "put",
    path: "/idp/oidc",
    description: "Create an OIDC IdP.",
    tags: [OpenAPITags.Idp],
    request: {
        body: {
            content: {
                "application/json": {
                    schema: bodySchema
                }
            }
        }
    },
    responses: {}
});

export async function createOidcIdp(
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

        const {
            clientId,
            clientSecret,
            authUrl,
            tokenUrl,
            scopes,
            identifierPath,
            emailPath,
            namePath,
            name,
            autoProvision
        } = parsedBody.data;

        const key = config.getRawConfig().server.secret!;

        const encryptedSecret = encrypt(clientSecret, key);
        const encryptedClientId = encrypt(clientId, key);

        let idpId: number | undefined;
        await db.transaction(async (trx) => {
            const [idpRes] = await trx
                .insert(idp)
                .values({
                    name,
                    autoProvision,
                    type: "oidc"
                })
                .returning();

            idpId = idpRes.idpId;

            await trx.insert(idpOidcConfig).values({
                idpId: idpRes.idpId,
                clientId: encryptedClientId,
                clientSecret: encryptedSecret,
                authUrl,
                tokenUrl,
                scopes,
                identifierPath,
                emailPath,
                namePath
            });
        });

        const redirectUrl = await generateOidcRedirectUrl(idpId as number);

        return response<CreateIdpResponse>(res, {
            data: {
                idpId: idpId as number,
                redirectUrl
            },
            success: true,
            error: false,
            message: "Idp created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
