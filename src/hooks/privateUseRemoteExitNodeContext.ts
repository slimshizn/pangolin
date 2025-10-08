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

"use client";

import RemoteExitNodeContext from "@app/contexts/privateRemoteExitNodeContext";
import { build } from "@server/build";
import { useContext } from "react";

export function useRemoteExitNodeContext() {
    if (build == "oss") {
        return null;
    }
    const context = useContext(RemoteExitNodeContext);
    if (context === undefined) {
        throw new Error("useRemoteExitNodeContext must be used within a RemoteExitNodeProvider");
    }
    return context;
}
