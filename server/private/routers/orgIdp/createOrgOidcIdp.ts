/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

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
import { build } from "@server/build";
import { getOrgTierData } from "#private/lib/billing";
import { TierId } from "@server/lib/billing/tiers";
import { CreateOrgIdpResponse } from "@server/routers/orgIdp/types";

const paramsSchema = z.object({ orgId: z.string().nonempty() }).strict();

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
        autoProvision: z.boolean().optional(),
        variant: z.enum(["oidc", "google", "azure"]).optional().default("oidc"),
        roleMapping: z.string().optional()
    })
    .strict();

// registry.registerPath({
//     method: "put",
//     path: "/idp/oidc",
//     description: "Create an OIDC IdP.",
//     tags: [OpenAPITags.Idp],
//     request: {
//         body: {
//             content: {
//                 "application/json": {
//                     schema: bodySchema
//                 }
//             }
//         }
//     },
//     responses: {}
// });

export async function createOrgOidcIdp(
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

        const { orgId } = parsedParams.data;

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
            autoProvision,
            variant,
            roleMapping
        } = parsedBody.data;

        if (build === "saas") {
            const { tier, active } = await getOrgTierData(orgId);
            const subscribed = tier === TierId.STANDARD;
            if (!subscribed) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "This organization's current plan does not support this feature."
                    )
                );
            }
        }

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
                namePath,
                variant
            });

            await trx.insert(idpOrg).values({
                idpId: idpRes.idpId,
                orgId: orgId,
                roleMapping: roleMapping || null,
                orgMapping: `'${orgId}'`
            });
        });

        const redirectUrl = await generateOidcRedirectUrl(idpId as number, orgId);

        return response<CreateOrgIdpResponse>(res, {
            data: {
                idpId: idpId as number,
                redirectUrl
            },
            success: true,
            error: false,
            message: "Org Idp created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
