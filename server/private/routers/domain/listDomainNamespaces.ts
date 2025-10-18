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
import { db, domainNamespaces } from "@server/db";
import { domains } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, sql } from "drizzle-orm";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const paramsSchema = z.object({}).strict();

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

async function query(limit: number, offset: number) {
    const res = await db
        .select({
            domainNamespaceId: domainNamespaces.domainNamespaceId,
            domainId: domainNamespaces.domainId
        })
        .from(domainNamespaces)
        .innerJoin(
            domains,
            eq(domains.domainId, domainNamespaces.domainNamespaceId)
        )
        .limit(limit)
        .offset(offset);
    return res;
}

export type ListDomainNamespacesResponse = {
    domainNamespaces: NonNullable<Awaited<ReturnType<typeof query>>>;
    pagination: { total: number; limit: number; offset: number };
};

registry.registerPath({
    method: "get",
    path: "/domains/namepaces",
    description: "List all domain namespaces in the system",
    tags: [OpenAPITags.Domain],
    request: {
        query: querySchema
    },
    responses: {}
});

export async function listDomainNamespaces(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
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

        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const domainNamespacesList = await query(limit, offset);

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(domainNamespaces);

        return response<ListDomainNamespacesResponse>(res, {
            data: {
                domainNamespaces: domainNamespacesList,
                pagination: {
                    total: count,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Namespaces retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
