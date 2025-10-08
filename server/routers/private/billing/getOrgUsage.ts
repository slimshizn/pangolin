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
import { orgs } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { Limit, limits, Usage, usage } from "@server/db";
import { usageService } from "@server/lib/private/billing/usageService";
import { FeatureId } from "@server/lib/private/billing";

const getOrgSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

export type GetOrgUsageResponse = {
    usage: Usage[];
    limits: Limit[];
};

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/billing/usage",
    description: "Get an organization's billing usage",
    tags: [OpenAPITags.Org],
    request: {
        params: getOrgSchema
    },
    responses: {}
});

export async function getOrgUsage(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getOrgSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const { orgId } = parsedParams.data;

        const org = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (org.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }

        // Get usage for org
        const usageData = [];

        const siteUptime = await usageService.getUsage(orgId, FeatureId.SITE_UPTIME);
        const users = await usageService.getUsageDaily(orgId, FeatureId.USERS);
        const domains = await usageService.getUsageDaily(orgId, FeatureId.DOMAINS);
        const remoteExitNodes = await usageService.getUsageDaily(orgId, FeatureId.REMOTE_EXIT_NODES);
        const egressData = await usageService.getUsage(orgId, FeatureId.EGRESS_DATA_MB);

        if (siteUptime) {
            usageData.push(siteUptime);
        }
        if (users) {
            usageData.push(users);
        }
        if (egressData) {
            usageData.push(egressData);
        }
        if (domains) {
            usageData.push(domains);
        }
        if (remoteExitNodes) {
            usageData.push(remoteExitNodes);
        }

        const orgLimits = await db.select()
            .from(limits)
            .where(eq(limits.orgId, orgId));

        return response<GetOrgUsageResponse>(res, {
            data: {
                usage: usageData,
                limits: orgLimits
            },
            success: true,
            error: false,
            message: "Organization usage retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
