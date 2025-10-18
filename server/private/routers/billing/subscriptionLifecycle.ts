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

import { freeLimitSet, limitsService, subscribedLimitSet } from "@server/lib/billing";
import { usageService } from "@server/lib/billing/usageService";
import logger from "@server/logger";

export async function handleSubscriptionLifesycle(orgId: string, status: string) {
    switch (status) {
        case "active":
            await limitsService.applyLimitSetToOrg(orgId, subscribedLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        case "canceled":
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        case "past_due":
            // Optionally handle past due status, e.g., notify customer
            break;
        case "unpaid":
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        case "incomplete":
            // Optionally handle incomplete status, e.g., notify customer
            break;
        case "incomplete_expired":
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId, true);
            break;
        default:
            break;
    }
}