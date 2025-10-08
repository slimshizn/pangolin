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
import { GetIdpResponse as GetOrgIdpResponse } from "@server/routers/idp";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getTranslations } from "next-intl/server";

interface SettingsLayoutProps {
    children: React.ReactNode;
    params: Promise<{ orgId: string; idpId: string }>;
}

export default async function SettingsLayout(props: SettingsLayoutProps) {
    const params = await props.params;
    const { children } = props;
    const t = await getTranslations();

    let idp = null;
    try {
        const res = await internal.get<AxiosResponse<GetOrgIdpResponse>>(
            `/org/${params.orgId}/idp/${params.idpId}`,
            await authCookieHeader()
        );
        idp = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/idp`);
    }

    const navItems: HorizontalTabs = [
        {
            title: t("general"),
            href: `/${params.orgId}/settings/idp/${params.idpId}/general`
        }
    ];

    return (
        <>
            <SettingsSectionTitle
                title={t("idpSettings", { idpName: idp.idp.name })}
                description={t("idpSettingsDescription")}
            />

            <div className="space-y-6">
                <HorizontalTabs items={navItems}>{children}</HorizontalTabs>
            </div>
        </>
    );
}
