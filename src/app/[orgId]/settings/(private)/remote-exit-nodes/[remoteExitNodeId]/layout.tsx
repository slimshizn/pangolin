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

import { internal } from "@app/lib/api";
import { GetRemoteExitNodeResponse } from "@server/routers/private/remoteExitNode";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getTranslations } from "next-intl/server";
import RemoteExitNodeProvider from "@app/providers/PrivateRemoteExitNodeProvider";

interface SettingsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ remoteExitNodeId: string; orgId: string }>;
}

export default async function SettingsLayout(props: SettingsLayoutProps) {
    const params = await props.params;
    const { children } = props;

    let remoteExitNode = null;
    try {
        const res = await internal.get<
            AxiosResponse<GetRemoteExitNodeResponse>
        >(
            `/org/${params.orgId}/remote-exit-node/${params.remoteExitNodeId}`,
            await authCookieHeader()
        );
        remoteExitNode = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/remote-exit-nodes`);
    }

    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={`Remote Exit Node ${remoteExitNode?.name || "Unknown"}`}
                description="Manage your remote exit node settings and configuration"
            />

            <RemoteExitNodeProvider remoteExitNode={remoteExitNode}>
                <div className="space-y-6">{children}</div>
            </RemoteExitNodeProvider>
        </>
    );
}
