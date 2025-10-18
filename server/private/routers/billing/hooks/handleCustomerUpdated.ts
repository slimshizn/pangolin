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

export async function handleCustomerUpdated(
    customer: Stripe.Customer
): Promise<void> {
    try {
        const [existingCustomer] = await db
            .select()
            .from(customers)
            .where(eq(customers.customerId, customer.id))
            .limit(1);

        if (!existingCustomer) {
            logger.info(`Customer with ID ${customer.id} does not exist.`);
            return;
        }

        const newCustomer = {
            customerId: customer.id,
            orgId: customer.metadata.orgId,
            email: customer.email || null,
            name: customer.name || null,
            updatedAt: Math.floor(Date.now() / 1000)
        };

        // Update the existing customer record
        await db
            .update(customers)
            .set(newCustomer)
            .where(eq(customers.customerId, customer.id));
    } catch (error) {
        logger.error(
            `Error handling customer created event for ID ${customer.id}:`,
            error
        );
    }
    return;
}
