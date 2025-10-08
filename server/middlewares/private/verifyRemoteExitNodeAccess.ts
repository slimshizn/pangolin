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
import { db, exitNodeOrgs, exitNodes, remoteExitNodes } from "@server/db";
import { sites, userOrgs, userSites, roleSites, roles } from "@server/db";
import { and, eq, or } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";

export async function verifyRemoteExitNodeAccess(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const userId = req.user!.userId; // Assuming you have user information in the request
    const orgId = req.params.orgId;
    const remoteExitNodeId =
        req.params.remoteExitNodeId ||
        req.body.remoteExitNodeId ||
        req.query.remoteExitNodeId;

    if (!userId) {
        return next(
            createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
        );
    }

    try {
        const [remoteExitNode] = await db
            .select()
            .from(remoteExitNodes)
            .where(and(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId)));

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

        const [exitNodeOrg] = await db
            .select()
            .from(exitNodeOrgs)
            .where(
                and(
                    eq(exitNodeOrgs.exitNodeId, remoteExitNode.exitNodeId),
                    eq(exitNodeOrgs.orgId, orgId)
                )
            );

        if (!exitNodeOrg) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Remote exit node with ID ${remoteExitNodeId} not found in organization ${orgId}`
                )
            );
        }

        if (!req.userOrg) {
            // Get user's role ID in the organization
            const userOrgRole = await db
                .select()
                .from(userOrgs)
                .where(
                    and(
                        eq(userOrgs.userId, userId),
                        eq(userOrgs.orgId, exitNodeOrg.orgId)
                    )
                )
                .limit(1);
            req.userOrg = userOrgRole[0];
        }

        if (!req.userOrg) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "User does not have access to this organization"
                )
            );
        }

        const userOrgRoleId = req.userOrg.roleId;
        req.userOrgRoleId = userOrgRoleId;

        return next();
    } catch (error) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying remote exit node access"
            )
        );
    }
}
