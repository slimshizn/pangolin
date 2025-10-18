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

import { getTierPriceSet } from "@server/lib/billing/tiers";
import { getOrgSubscriptionData } from "#private/routers/billing/getOrgSubscription";
import { build } from "@server/build";

export async function getOrgTierData(
    orgId: string
): Promise<{ tier: string | null; active: boolean }> {
    let tier = null;
    let active = false;

    if (build !== "saas") {
        return { tier, active };
    }

    const { subscription, items } = await getOrgSubscriptionData(orgId);

    if (items && items.length > 0) {
        const tierPriceSet = getTierPriceSet();
        // Iterate through tiers in order (earlier keys are higher tiers)
        for (const [tierId, priceId] of Object.entries(tierPriceSet)) {
            // Check if any subscription item matches this tier's price ID
            const matchingItem = items.find((item) => item.priceId === priceId);
            if (matchingItem) {
                tier = tierId;
                break;
            }
        }
    }
    if (subscription && subscription.status === "active") {
        active = true;
    }
    return { tier, active };
}
