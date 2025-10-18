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
import { userOrgs, db, loginPageOrg } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";

export async function verifyLoginPageAccess(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const userId = req.user!.userId;
        const loginPageId =
            req.params.loginPageId ||
            req.body.loginPageId ||
            req.query.loginPageId;

        if (!userId) {
            return next(
                createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
            );
        }

        if (!loginPageId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invalid login page ID")
            );
        }

        const loginPageOrgs = await db
            .select({
                orgId: loginPageOrg.orgId
            })
            .from(loginPageOrg)
            .where(eq(loginPageOrg.loginPageId, loginPageId));

        const orgIds = loginPageOrgs.map((lpo) => lpo.orgId);

        const existingUserOrgs = await db
            .select()
            .from(userOrgs)
            .where(
                and(
                    eq(userOrgs.userId, userId),
                    inArray(userOrgs.orgId, orgIds)
                )
            );

        if (existingUserOrgs.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Login page with ID ${loginPageId} not found for user's organizations`
                )
            );
        }

        return next();
    } catch (error) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying login page access"
            )
        );
    }
}
