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
import { customers, db } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import config from "@server/lib/config";
import { fromError } from "zod-validation-error";
import stripe from "@server/lib/private/stripe";
import { getLineItems, getStandardFeaturePriceSet } from "@server/lib/private/billing";
import { getTierPriceSet, TierId } from "@server/lib/private/billing/tiers";

const createCheckoutSessionSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

export async function createCheckoutSession(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = createCheckoutSessionSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        // check if we already have a customer for this org
        const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.orgId, orgId))
            .limit(1);

        // If we don't have a customer, create one
        if (!customer) {
            // error
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "No customer found for this organization"
                )
            );
        }

        const standardTierPrice = getTierPriceSet()[TierId.STANDARD];

        const session = await stripe!.checkout.sessions.create({
            client_reference_id: orgId, // So we can look it up the org later on the webhook
            billing_address_collection: "required",
            line_items: [
                {
                    price: standardTierPrice, // Use the standard tier 
                    quantity: 1
                },
                ...getLineItems(getStandardFeaturePriceSet())
            ], // Start with the standard feature set that matches the free limits
            customer: customer.customerId,
            mode: "subscription",
            success_url: `${config.getRawConfig().app.dashboard_url}/${orgId}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.getRawConfig().app.dashboard_url}/${orgId}/settings/billing?canceled=true`
        });

        return response<string>(res, {
            data: session.url,
            success: true,
            error: false,
            message: "Organization created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
