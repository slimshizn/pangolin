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
    subscriptions,
    db,
    subscriptionItems,
    usage,
    sites,
    customers,
    orgs
} from "@server/db";
import { eq, and } from "drizzle-orm";
import logger from "@server/logger";
import { getFeatureIdByMetricId } from "@server/lib/private/billing/features";
import stripe from "@server/lib/private/stripe";
import { handleSubscriptionLifesycle } from "../subscriptionLifecycle";

export async function handleSubscriptionUpdated(
    subscription: Stripe.Subscription,
    previousAttributes: Partial<Stripe.Subscription> | undefined
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

        // get the customer
        const [existingCustomer] = await db
            .select()
            .from(customers)
            .where(eq(customers.customerId, subscription.customer as string))
            .limit(1);

        await db
            .update(subscriptions)
            .set({
                status: subscription.status,
                canceledAt: subscription.canceled_at
                    ? subscription.canceled_at
                    : null,
                updatedAt: Math.floor(Date.now() / 1000),
                billingCycleAnchor: subscription.billing_cycle_anchor
            })
            .where(eq(subscriptions.subscriptionId, subscription.id));

        await handleSubscriptionLifesycle(
            existingCustomer.orgId,
            subscription.status
        );

        // Upsert subscription items
        if (Array.isArray(fullSubscription.items?.data)) {
            const itemsToUpsert = fullSubscription.items.data.map((item) => ({
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
                interval: item.plan.interval
            }));
            if (itemsToUpsert.length > 0) {
                await db.transaction(async (trx) => {
                    await trx
                        .delete(subscriptionItems)
                        .where(
                            eq(
                                subscriptionItems.subscriptionId,
                                subscription.id
                            )
                        );

                    await trx.insert(subscriptionItems).values(itemsToUpsert);
                });
                logger.info(
                    `Updated ${itemsToUpsert.length} subscription items for subscription ${subscription.id}.`
                );
            }

            // --- Detect cycled items and update usage ---
            if (previousAttributes) {
                // Only proceed if latest_invoice changed (per Stripe docs)
                if ("latest_invoice" in previousAttributes) {
                    // If items array present in previous_attributes, check each item
                    if (Array.isArray(previousAttributes.items?.data)) {
                        for (const item of subscription.items.data) {
                            const prevItem = previousAttributes.items.data.find(
                                (pi: any) => pi.id === item.id
                            );
                            if (
                                prevItem &&
                                prevItem.current_period_end &&
                                item.current_period_start &&
                                prevItem.current_period_end ===
                                    item.current_period_start &&
                                item.current_period_start >
                                    prevItem.current_period_start
                            ) {
                                logger.info(
                                    `Subscription item ${item.id} has cycled. Resetting usage.`
                                );
                            } else {
                                continue;
                            }

                            // This item has cycled
                            const meterId = item.plan.meter;
                            if (!meterId) {
                                logger.warn(
                                    `No meterId found for subscription item ${item.id}. Skipping usage reset.`
                                );
                                continue;
                            }
                            const featureId = getFeatureIdByMetricId(meterId);
                            if (!featureId) {
                                logger.warn(
                                    `No featureId found for meterId ${meterId}. Skipping usage reset.`
                                );
                                continue;
                            }

                            const orgId = existingCustomer.orgId;

                            if (!orgId) {
                                logger.warn(
                                    `No orgId found in subscription metadata for subscription ${subscription.id}. Skipping usage reset.`
                                );
                                continue;
                            }

                            await db.transaction(async (trx) => {
                                const [usageRow] = await trx
                                    .select()
                                    .from(usage)
                                    .where(
                                        eq(
                                            usage.usageId,
                                            `${orgId}-${featureId}`
                                        )
                                    )
                                    .limit(1);

                                if (usageRow) {
                                    // get the next rollover date

                                    const [org] = await trx
                                        .select()
                                        .from(orgs)
                                        .where(eq(orgs.orgId, orgId))
                                        .limit(1);

                                    const lastRollover = usageRow.rolledOverAt
                                        ? new Date(usageRow.rolledOverAt * 1000)
                                        : new Date();
                                    const anchorDate = org.createdAt
                                        ? new Date(org.createdAt)
                                        : new Date();

                                    const nextRollover =
                                        calculateNextRollOverDate(
                                            lastRollover,
                                            anchorDate
                                        );

                                    await trx
                                        .update(usage)
                                        .set({
                                            previousValue: usageRow.latestValue,
                                            latestValue:
                                                usageRow.instantaneousValue ||
                                                0,
                                            updatedAt: Math.floor(
                                                Date.now() / 1000
                                            ),
                                            rolledOverAt: Math.floor(
                                                Date.now() / 1000
                                            ),
                                            nextRolloverAt: Math.floor(
                                                nextRollover.getTime() / 1000
                                            )
                                        })
                                        .where(
                                            eq(usage.usageId, usageRow.usageId)
                                        );
                                    logger.info(
                                        `Usage reset for org ${orgId}, meter ${featureId} on subscription item cycle.`
                                    );
                                }

                                // Also reset the sites to 0
                                await trx
                                    .update(sites)
                                    .set({
                                        megabytesIn: 0,
                                        megabytesOut: 0
                                    })
                                    .where(eq(sites.orgId, orgId));
                            });
                        }
                    }
                }
            }
            // --- end usage update ---
        }
    } catch (error) {
        logger.error(
            `Error handling subscription updated event for ID ${subscription.id}:`,
            error
        );
    }
    return;
}

/**
 * Calculate the next billing date based on monthly billing cycle
 * Handles end-of-month scenarios as described in the requirements
 * Made public for testing
 */
function calculateNextRollOverDate(lastRollover: Date, anchorDate: Date): Date {
    const rolloverDate = new Date(lastRollover);
    const anchor = new Date(anchorDate);

    // Get components from rollover date
    const rolloverYear = rolloverDate.getUTCFullYear();
    const rolloverMonth = rolloverDate.getUTCMonth();

    // Calculate target month and year (next month)
    let targetMonth = rolloverMonth + 1;
    let targetYear = rolloverYear;

    if (targetMonth > 11) {
        targetMonth = 0;
        targetYear++;
    }

    // Get anchor day for billing
    const anchorDay = anchor.getUTCDate();

    // Get the last day of the target month
    const lastDayOfMonth = new Date(
        Date.UTC(targetYear, targetMonth + 1, 0)
    ).getUTCDate();

    // Use the anchor day or the last day of the month, whichever is smaller
    const targetDay = Math.min(anchorDay, lastDayOfMonth);

    // Create the next billing date using UTC
    const nextBilling = new Date(
        Date.UTC(
            targetYear,
            targetMonth,
            targetDay,
            anchor.getUTCHours(),
            anchor.getUTCMinutes(),
            anchor.getUTCSeconds(),
            anchor.getUTCMilliseconds()
        )
    );

    return nextBilling;
}
