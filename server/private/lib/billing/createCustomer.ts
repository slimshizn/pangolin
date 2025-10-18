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

import { customers, db } from "@server/db";
import { eq } from "drizzle-orm";
import stripe from "#private/lib/stripe";
import { build } from "@server/build";

export async function createCustomer(
    orgId: string,
    email: string | null | undefined
): Promise<string | undefined> {
    if (build !== "saas") {
        return;
    }

    const [customer] = await db
        .select()
        .from(customers)
        .where(eq(customers.orgId, orgId))
        .limit(1);

    let customerId: string;
    // If we don't have a customer, create one
    if (!customer) {
        const newCustomer = await stripe!.customers.create({
            metadata: {
                orgId: orgId
            },
            email: email || undefined
        });
        customerId = newCustomer.id;
        // It will get inserted into the database by the webhook
    } else {
        customerId = customer.customerId;
    }
    return customerId;
}
