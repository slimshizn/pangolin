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
import { db, idpOrg } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { idp, idpOidcConfig } from "@server/db";
import { eq, and } from "drizzle-orm";
import { encrypt } from "@server/lib/crypto";
import config from "@server/lib/config";
import { build } from "@server/build";
import { getOrgTierData } from "#private/lib/billing";
import { TierId } from "@server/lib/billing/tiers";

const paramsSchema = z
    .object({
        orgId: z.string().nonempty(),
        idpId: z.coerce.number()
    })
    .strict();

const bodySchema = z
    .object({
        name: z.string().optional(),
        clientId: z.string().optional(),
        clientSecret: z.string().optional(),
        authUrl: z.string().optional(),
        tokenUrl: z.string().optional(),
        identifierPath: z.string().optional(),
        emailPath: z.string().optional(),
        namePath: z.string().optional(),
        scopes: z.string().optional(),
        autoProvision: z.boolean().optional(),
        roleMapping: z.string().optional()
    })
    .strict();

export type UpdateOrgIdpResponse = {
    idpId: number;
};

// registry.registerPath({
//     method: "post",
//     path: "/idp/{idpId}/oidc",
//     description: "Update an OIDC IdP.",
//     tags: [OpenAPITags.Idp],
//     request: {
//         params: paramsSchema,
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

export async function updateOrgOidcIdp(
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

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { idpId, orgId } = parsedParams.data;
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

        // Check if IDP exists and is of type OIDC
        const [existingIdp] = await db
            .select()
            .from(idp)
            .where(eq(idp.idpId, idpId));

        if (!existingIdp) {
            return next(createHttpError(HttpCode.NOT_FOUND, "IdP not found"));
        }

        const [existingIdpOrg] = await db
            .select()
            .from(idpOrg)
            .where(and(eq(idpOrg.orgId, orgId), eq(idpOrg.idpId, idpId)));

        if (!existingIdpOrg) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "IdP not found for this organization"
                )
            );
        }

        if (existingIdp.type !== "oidc") {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "IdP is not an OIDC provider"
                )
            );
        }

        const key = config.getRawConfig().server.secret!;
        const encryptedSecret = clientSecret
            ? encrypt(clientSecret, key)
            : undefined;
        const encryptedClientId = clientId ? encrypt(clientId, key) : undefined;

        await db.transaction(async (trx) => {
            const idpData = {
                name,
                autoProvision
            };

            // only update if at least one key is not undefined
            let keysToUpdate = Object.keys(idpData).filter(
                (key) => idpData[key as keyof typeof idpData] !== undefined
            );

            if (keysToUpdate.length > 0) {
                await trx.update(idp).set(idpData).where(eq(idp.idpId, idpId));
            }

            const configData = {
                clientId: encryptedClientId,
                clientSecret: encryptedSecret,
                authUrl,
                tokenUrl,
                scopes,
                identifierPath,
                emailPath,
                namePath
            };

            keysToUpdate = Object.keys(configData).filter(
                (key) =>
                    configData[key as keyof typeof configData] !== undefined
            );

            if (keysToUpdate.length > 0) {
                // Update OIDC config
                await trx
                    .update(idpOidcConfig)
                    .set(configData)
                    .where(eq(idpOidcConfig.idpId, idpId));
            }

            if (roleMapping !== undefined) {
                // Update IdP-org policy
                await trx
                    .update(idpOrg)
                    .set({
                        roleMapping
                    })
                    .where(
                        and(eq(idpOrg.idpId, idpId), eq(idpOrg.orgId, orgId))
                    );
            }
        });

        return response<UpdateOrgIdpResponse>(res, {
            data: {
                idpId
            },
            success: true,
            error: false,
            message: "Org IdP updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
