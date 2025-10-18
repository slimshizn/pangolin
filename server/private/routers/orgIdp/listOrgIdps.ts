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
import { db, idpOidcConfig } from "@server/db";
import { idp, idpOrg } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, sql } from "drizzle-orm";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { ListOrgIdpsResponse } from "@server/routers/orgIdp/types";

const querySchema = z
    .object({
        limit: z
            .string()
            .optional()
            .default("1000")
            .transform(Number)
            .pipe(z.number().int().nonnegative()),
        offset: z
            .string()
            .optional()
            .default("0")
            .transform(Number)
            .pipe(z.number().int().nonnegative())
    })
    .strict();

const paramsSchema = z
    .object({
        orgId: z.string().nonempty()
    })
    .strict();

async function query(orgId: string, limit: number, offset: number) {
    const res = await db
        .select({
            idpId: idp.idpId,
            orgId: idpOrg.orgId,
            name: idp.name,
            type: idp.type,
            variant: idpOidcConfig.variant
        })
        .from(idpOrg)
        .where(eq(idpOrg.orgId, orgId))
        .innerJoin(idp, eq(idp.idpId, idpOrg.idpId))
        .innerJoin(idpOidcConfig, eq(idpOidcConfig.idpId, idpOrg.idpId))
        .orderBy(sql`idp.name DESC`)
        .limit(limit)
        .offset(offset);
    return res;
}

// registry.registerPath({
//     method: "get",
//     path: "/idp",
//     description: "List all IDP in the system.",
//     tags: [OpenAPITags.Idp],
//     request: {
//         query: querySchema
//     },
//     responses: {}
// });

export async function listOrgIdps(
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

        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const list = await query(orgId, limit, offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(idp);

        return response<ListOrgIdpsResponse>(res, {
            data: {
                idps: list,
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Org Idps retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
