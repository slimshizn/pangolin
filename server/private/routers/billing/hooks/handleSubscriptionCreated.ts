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
import {
    customers,
    subscriptions,
    db,
    subscriptionItems,
    userOrgs,
    users
} from "@server/db";
import { eq, and } from "drizzle-orm";
import logger from "@server/logger";
import stripe from "#private/lib/stripe";
import { handleSubscriptionLifesycle } from "../subscriptionLifecycle";
import { AudienceIds, moveEmailToAudience } from "#private/lib/resend";

export async function handleSubscriptionCreated(
    subscription: Stripe.Subscription
): Promise<void> {
    try {
        // Fetch the subscription from Stripe with expanded price.tiers
        const fullSubscription = await stripe!.subscriptions.retrieve(
            subscription.id,
            {
                expand: ["items.data.price.tiers"]
            }
        );

        logger.info(JSON.stringify(fullSubscription, null, 2));
        // Check if subscription already exists
        const [existingSubscription] = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.subscriptionId, subscription.id))
            .limit(1);

        if (existingSubscription) {
            logger.info(
                `Subscription with ID ${subscription.id} already exists.`
            );
            return;
        }

        const newSubscription = {
            subscriptionId: subscription.id,
            customerId: subscription.customer as string,
            status: subscription.status,
            canceledAt: subscription.canceled_at
                ? subscription.canceled_at
                : null,
            createdAt: subscription.created
        };

        await db.insert(subscriptions).values(newSubscription);
        logger.info(
            `Subscription with ID ${subscription.id} created successfully.`
        );

        // Insert subscription items
        if (Array.isArray(fullSubscription.items?.data)) {
            const itemsToInsertPromises = fullSubscription.items.data.map(
                async (item) => {
                    // try to get the product name from stripe and add it to the item
                    let name = null;
                    if (item.price.product) {
                        const product = await stripe!.products.retrieve(
                            item.price.product as string
                        );
                        name = product.name || null;
                    }

                    return {
                        subscriptionId: subscription.id,
                        planId: item.plan.id,
                        priceId: item.price.id,
                        meterId: item.plan.meter,
                        unitAmount: item.price.unit_amount || 0,
                        currentPeriodStart: item.current_period_start,
                        currentPeriodEnd: item.current_period_end,
                        tiers: item.price.tiers
                            ? JSON.stringify(item.price.tiers)
                            : null,
                        interval: item.plan.interval,
                        name
                    };
                }
            );

            // wait for all items to be processed
            const itemsToInsert = await Promise.all(itemsToInsertPromises);

            if (itemsToInsert.length > 0) {
                await db.insert(subscriptionItems).values(itemsToInsert);
                logger.info(
                    `Inserted ${itemsToInsert.length} subscription items for subscription ${subscription.id}.`
                );
            }
        }

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

        await handleSubscriptionLifesycle(customer.orgId, subscription.status);

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
                moveEmailToAudience(email, AudienceIds.Subscribed);
            }
        }
    } catch (error) {
        logger.error(
            `Error handling subscription created event for ID ${subscription.id}:`,
            error
        );
    }
    return;
}
