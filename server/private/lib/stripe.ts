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
import privateConfig from "#private/lib/config";
import logger from "@server/logger";
import { noop } from "@server/lib/billing/usageService";

let stripe: Stripe | undefined = undefined;
if (!noop()) {
    const stripeApiKey = privateConfig.getRawPrivateConfig().stripe?.secret_key;
    if (!stripeApiKey) {
        logger.error("Stripe secret key is not configured");
    }
    stripe = new Stripe(stripeApiKey!);
}

export default stripe;
