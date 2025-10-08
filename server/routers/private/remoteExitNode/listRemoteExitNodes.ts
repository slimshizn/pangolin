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

import { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { db, exitNodeOrgs, exitNodes } from "@server/db";
import { remoteExitNodes } from "@server/db";
import { eq, and, count } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";

const listRemoteExitNodesParamsSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

const listRemoteExitNodesSchema = z.object({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.number().int().positive()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.number().int().nonnegative())
});

function queryRemoteExitNodes(orgId: string) {
    return db
        .select({
            remoteExitNodeId: remoteExitNodes.remoteExitNodeId,
            dateCreated: remoteExitNodes.dateCreated,
            version: remoteExitNodes.version,
            exitNodeId: remoteExitNodes.exitNodeId,
            name: exitNodes.name,
            address: exitNodes.address,
            endpoint: exitNodes.endpoint,
            online: exitNodes.online,
            type: exitNodes.type
        })
        .from(exitNodeOrgs)
        .where(eq(exitNodeOrgs.orgId, orgId))
        .innerJoin(exitNodes, eq(exitNodes.exitNodeId, exitNodeOrgs.exitNodeId))
        .innerJoin(
            remoteExitNodes,
            eq(remoteExitNodes.exitNodeId, exitNodeOrgs.exitNodeId)
        );
}

export type ListRemoteExitNodesResponse = {
    remoteExitNodes: Awaited<ReturnType<typeof queryRemoteExitNodes>>;
    pagination: { total: number; limit: number; offset: number };
};

export async function listRemoteExitNodes(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedQuery = listRemoteExitNodesSchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error)
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const parsedParams = listRemoteExitNodesParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error)
                )
            );
        }
        const { orgId } = parsedParams.data;

        if (req.user && orgId && orgId !== req.userOrgId) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        const baseQuery = queryRemoteExitNodes(orgId);

        const countQuery = db
            .select({ count: count() })
            .from(remoteExitNodes)
            .innerJoin(
                exitNodes,
                eq(exitNodes.exitNodeId, remoteExitNodes.exitNodeId)
            )
            .where(eq(exitNodes.type, "remoteExitNode"));

        const remoteExitNodesList = await baseQuery.limit(limit).offset(offset);
        const totalCountResult = await countQuery;
        const totalCount = totalCountResult[0].count;

        return response<ListRemoteExitNodesResponse>(res, {
            data: {
                remoteExitNodes: remoteExitNodesList,
                pagination: {
                    total: totalCount,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Remote exit nodes retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
