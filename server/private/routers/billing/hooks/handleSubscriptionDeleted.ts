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
import { subscriptions, db, subscriptionItems, customers, userOrgs, users } from "@server/db";
import { eq, and } from "drizzle-orm";
import logger from "@server/logger";
import { handleSubscriptionLifesycle } from "../subscriptionLifecycle";
import { AudienceIds, moveEmailToAudience } from "#private/lib/resend";

export async function handleSubscriptionDeleted(
    subscription: Stripe.Subscription
): Promise<void> {
    try {
        const [existingSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.subscriptionId, subscription.id))
            .limit(1);

        if (!existingSubscription) {
            logger.info(
                `Subscription with ID ${subscription.id} does not exist.`
            );
            return;
        }

        await db
            .delete(subscriptions)
            .where(eq(subscriptions.subscriptionId, subscription.id));

        await db
            .delete(subscriptionItems)
            .where(eq(subscriptionItems.subscriptionId, subscription.id));


        // Lookup customer to get orgId
        const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.customerId, subscription.customer as string))
            .limit(1);

        if (!customer) {
            logger.error(
                `Customer with ID ${subscription.customer} not found for subscription ${subscription.id}.`
            );
            return;
        }

        await handleSubscriptionLifesycle(
            customer.orgId,
            subscription.status
        );

        const [orgUserRes] = await db
            .select()
            .from(userOrgs)
            .where(
                and(
                    eq(userOrgs.orgId, customer.orgId),
                    eq(userOrgs.isOwner, true)
                )
            )
            .innerJoin(users, eq(userOrgs.userId, users.userId));

        if (orgUserRes) {
            const email = orgUserRes.user.email;

            if (email) {
                moveEmailToAudience(email, AudienceIds.Churned);
            }
        }
    } catch (error) {
        logger.error(
            `Error handling subscription updated event for ID ${subscription.id}:`,
            error
        );
    }
    return;
}
