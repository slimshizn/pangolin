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
import { GetRemoteExitNodeResponse } from "@server/routers/private/remoteExitNode";
import { useState } from "react";
import { useTranslations } from "next-intl";

type RemoteExitNodeProviderProps = {
    children: React.ReactNode;
    remoteExitNode: GetRemoteExitNodeResponse;
};

export function RemoteExitNodeProvider({
    children,
    remoteExitNode: serverRemoteExitNode
}: RemoteExitNodeProviderProps) {
    const [remoteExitNode, setRemoteExitNode] = useState<GetRemoteExitNodeResponse>(serverRemoteExitNode);

    const t = useTranslations();

    const updateRemoteExitNode = (updatedRemoteExitNode: Partial<GetRemoteExitNodeResponse>) => {
        if (!remoteExitNode) {
            throw new Error(t('remoteExitNodeErrorNoUpdate'));
        }
        setRemoteExitNode((prev) => {
            if (!prev) {
                return prev;
            }
            return {
                ...prev,
                ...updatedRemoteExitNode
            };
        });
    };

    return (
        <RemoteExitNodeContext.Provider value={{ remoteExitNode, updateRemoteExitNode }}>
            {children}
        </RemoteExitNodeContext.Provider>
    );
}

export default RemoteExitNodeProvider;
