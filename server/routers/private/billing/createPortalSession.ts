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
import { account, customers, db } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import config from "@server/lib/config";
import { fromError } from "zod-validation-error";
import stripe from "@server/lib/private/stripe";

const createPortalSessionSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

export async function createPortalSession(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = createPortalSessionSchema.safeParse(req.params);
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

        let customerId: string;
        // If we don't have a customer, create one
        if (!customer) {
            // error
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "No customer found for this organization"
                )
            );
        } else {
            // If we have a customer, use the existing customer ID
            customerId = customer.customerId;
        }
        const portalSession = await stripe!.billingPortal.sessions.create({
            customer: customerId,
            return_url: `${config.getRawConfig().app.dashboard_url}/${orgId}/settings/billing`
        });

        return response<string>(res, {
            data: portalSession.url,
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
