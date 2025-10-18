"use client";

import RemoteExitNodeContext from "@app/contexts/remoteExitNodeContext";
import { GetRemoteExitNodeResponse } from "@server/routers/remoteExitNode/types";
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
