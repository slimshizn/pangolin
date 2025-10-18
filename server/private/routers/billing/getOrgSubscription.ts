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
import { Org, orgs } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";

// Import tables for billing
import {
    customers,
    subscriptions,
    subscriptionItems,
    Subscription,
    SubscriptionItem
} from "@server/db";

const getOrgSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/billing/subscription",
    description: "Get an organization",
    tags: [OpenAPITags.Org],
    request: {
        params: getOrgSchema
    },
    responses: {}
});

export async function getOrgSubscription(
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

        let subscriptionData = null;
        let itemsData: SubscriptionItem[] = [];
        try {
            const { subscription, items } = await getOrgSubscriptionData(orgId);
            subscriptionData = subscription;
            itemsData = items;
        } catch (err) {
            if ((err as Error).message === "Not found") {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Organization with ID ${orgId} not found`
                    )
                );
            }
            throw err;
        }

        return response<GetOrgSubscriptionResponse>(res, {
            data: {
                subscription: subscriptionData,
                items: itemsData
            },
            success: true,
            error: false,
            message: "Organization and subscription retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

export async function getOrgSubscriptionData(
    orgId: string
): Promise<{ subscription: Subscription | null; items: SubscriptionItem[] }> {
    const org = await db
        .select()
        .from(orgs)
        .where(eq(orgs.orgId, orgId))
        .limit(1);

    if (org.length === 0) {
        throw new Error(`Not found`);
    }

    // Get customer for org
    const customer = await db
        .select()
        .from(customers)
        .where(eq(customers.orgId, orgId))
        .limit(1);

    let subscription = null;
    let items: SubscriptionItem[] = [];

    if (customer.length > 0) {
        // Get subscription for customer
        const subs = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.customerId, customer[0].customerId))
            .limit(1);

        if (subs.length > 0) {
            subscription = subs[0];
            // Get subscription items
            items = await db
                .select()
                .from(subscriptionItems)
                .where(
                    eq(
                        subscriptionItems.subscriptionId,
                        subscription.subscriptionId
                    )
                );
        }
    }

    return { subscription, items };
}
