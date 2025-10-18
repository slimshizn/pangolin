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
import { db, ExitNodeOrg, exitNodeOrgs, exitNodes } from "@server/db";
import { remoteExitNodes } from "@server/db";
import { and, count, eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing";

const paramsSchema = z
    .object({
        orgId: z.string().min(1),
        remoteExitNodeId: z.string().min(1)
    })
    .strict();

export async function deleteRemoteExitNode(
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

        const { orgId, remoteExitNodeId } = parsedParams.data;

        const [remoteExitNode] = await db
            .select()
            .from(remoteExitNodes)
            .where(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId));

        if (!remoteExitNode) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Remote exit node with ID ${remoteExitNodeId} not found`
                )
            );
        }

        if (!remoteExitNode.exitNodeId) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    `Remote exit node with ID ${remoteExitNodeId} does not have an exit node ID`
                )
            );
        }

        let numExitNodeOrgs: ExitNodeOrg[] | undefined;
        await db.transaction(async (trx) => {
            await trx
                .delete(exitNodeOrgs)
                .where(
                    and(
                        eq(exitNodeOrgs.orgId, orgId),
                        eq(exitNodeOrgs.exitNodeId, remoteExitNode.exitNodeId!)
                    )
                );

            const [remainingExitNodeOrgs] = await trx
                .select({ count: count() })
                .from(exitNodeOrgs)
                .where(eq(exitNodeOrgs.exitNodeId, remoteExitNode.exitNodeId!));

            if (remainingExitNodeOrgs.count === 0) {
                await trx
                    .delete(remoteExitNodes)
                    .where(
                        eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId)
                    );
                await trx
                    .delete(exitNodes)
                    .where(
                        eq(exitNodes.exitNodeId, remoteExitNode.exitNodeId!)
                    );
            }

            numExitNodeOrgs = await trx
                .select()
                .from(exitNodeOrgs)
                .where(eq(exitNodeOrgs.orgId, orgId));
        });

        if (numExitNodeOrgs) {
            await usageService.updateDaily(
                orgId,
                FeatureId.REMOTE_EXIT_NODES,
                numExitNodeOrgs.length
            );
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Remote exit node deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
