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

import PrivateSubscriptionStatusContext from "@app/contexts/privateSubscriptionStatusContext";
import { build } from "@server/build";
import { useContext } from "react";

export function usePrivateSubscriptionStatusContext() {
    if (build == "oss") {
        return null;
    }
    const context = useContext(PrivateSubscriptionStatusContext);
    if (context === undefined) {
        throw new Error(
            "usePrivateSubscriptionStatusContext must be used within an PrivateSubscriptionStatusProvider"
        );
    }
    return context;
}
