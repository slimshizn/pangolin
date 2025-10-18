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
import { db, exitNodes } from "@server/db";
import { remoteExitNodes } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { GetRemoteExitNodeResponse } from "@server/routers/remoteExitNode/types";

const getRemoteExitNodeSchema = z
    .object({
        orgId: z.string().min(1),
        remoteExitNodeId: z.string().min(1)
    })
    .strict();

async function query(remoteExitNodeId: string) {
    const [remoteExitNode] = await db
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
        .from(remoteExitNodes)
        .innerJoin(
            exitNodes,
            eq(exitNodes.exitNodeId, remoteExitNodes.exitNodeId)
        )
        .where(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId))
        .limit(1);
    return remoteExitNode;
}

export async function getRemoteExitNode(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getRemoteExitNodeSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { remoteExitNodeId } = parsedParams.data;

        const remoteExitNode = await query(remoteExitNodeId);

        if (!remoteExitNode) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Remote exit node with ID ${remoteExitNodeId} not found`
                )
            );
        }

        return response<GetRemoteExitNodeResponse>(res, {
            data: remoteExitNode,
            success: true,
            error: false,
            message: "Remote exit node retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
