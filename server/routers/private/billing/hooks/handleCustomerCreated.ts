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

import Stripe from "stripe";
import { customers, db } from "@server/db";
import { eq } from "drizzle-orm";
import logger from "@server/logger";

export async function handleCustomerCreated(
    customer: Stripe.Customer
): Promise<void> {
    try {
        const [existingCustomer] = await db
            .select()
            .from(customers)
            .where(eq(customers.customerId, customer.id))
            .limit(1);

        if (existingCustomer) {
            logger.info(`Customer with ID ${customer.id} already exists.`);
            return;
        }

        if (!customer.metadata.orgId) {
            logger.error(
                `Customer with ID ${customer.id} does not have an orgId in metadata.`
            );
            return;
        }

        await db.insert(customers).values({
            customerId: customer.id,
            orgId: customer.metadata.orgId,
            email: customer.email || null,
            name: customer.name || null,
            createdAt: customer.created,
            updatedAt: customer.created
        });
        logger.info(`Customer with ID ${customer.id} created successfully.`);
    } catch (error) {
        logger.error(
            `Error handling customer created event for ID ${customer.id}:`,
            error
        );
    }
    return;
}
