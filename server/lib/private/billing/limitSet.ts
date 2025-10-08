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

import { FeatureId } from "./features";

export type LimitSet = {
    [key in FeatureId]: {
        value: number | null; // null indicates no limit
        description?: string;
    };
};

export const sandboxLimitSet: LimitSet = {
    [FeatureId.SITE_UPTIME]: { value: 2880, description: "Sandbox limit" }, // 1 site up for 2 days
    [FeatureId.USERS]: { value: 1, description: "Sandbox limit" },
    [FeatureId.EGRESS_DATA_MB]: { value: 1000, description: "Sandbox limit" }, // 1 GB
    [FeatureId.DOMAINS]: { value: 0, description: "Sandbox limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 0, description: "Sandbox limit" },
};

export const freeLimitSet: LimitSet = {
    [FeatureId.SITE_UPTIME]: { value: 46080, description: "Free tier limit" }, // 1 site up for 32 days
    [FeatureId.USERS]: { value: 3, description: "Free tier limit" },
    [FeatureId.EGRESS_DATA_MB]: {
        value: 25000,
        description: "Free tier limit"
    }, // 25 GB
    [FeatureId.DOMAINS]: { value: 3, description: "Free tier limit" },
    [FeatureId.REMOTE_EXIT_NODES]: { value: 1, description: "Free tier limit" }
};

export const subscribedLimitSet: LimitSet = {
    [FeatureId.SITE_UPTIME]: {
        value: 2232000,
        description: "Contact us to increase soft limit.",
    }, // 50 sites up for 31 days
    [FeatureId.USERS]: {
        value: 150,
        description: "Contact us to increase soft limit."
    },
    [FeatureId.EGRESS_DATA_MB]: {
        value: 12000000,
        description: "Contact us to increase soft limit."
    }, // 12000 GB 
    [FeatureId.DOMAINS]: {
        value: 25,
        description: "Contact us to increase soft limit."
    },
    [FeatureId.REMOTE_EXIT_NODES]: {
        value: 5,
        description: "Contact us to increase soft limit."
    }
};
