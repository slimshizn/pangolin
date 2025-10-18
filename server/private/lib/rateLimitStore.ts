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

import { build } from "@server/build";
import privateConfig from "#private/lib/config";
import { MemoryStore, Store } from "express-rate-limit";
import RedisStore from "#private/lib/redisStore";

export function createStore(): Store {
    if (build != "oss" && privateConfig.getRawPrivateConfig().flags.enable_redis) {
        const rateLimitStore: Store = new RedisStore({
            prefix: "api-rate-limit", // Optional: customize Redis key prefix
            skipFailedRequests: true, // Don't count failed requests
            skipSuccessfulRequests: false // Count successful requests
        });

        return rateLimitStore;
    } else {
        const rateLimitStore: Store = new MemoryStore();
        return rateLimitStore;
    }
}
