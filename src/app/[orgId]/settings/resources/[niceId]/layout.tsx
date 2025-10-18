import ResourceProvider from "@app/providers/ResourceProvider";
import { internal } from "@app/lib/api";
import {
    GetResourceAuthInfoResponse,
    GetResourceResponse
} from "@server/routers/resource";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { authCookieHeader } from "@app/lib/api/cookies";
import { HorizontalTabs } from "@app/components/HorizontalTabs";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { GetOrgResponse } from "@server/routers/org";
import OrgProvider from "@app/providers/OrgProvider";
import { cache } from "react";
import ResourceInfoBox from "../../../../../components/ResourceInfoBox";
import { GetSiteResponse } from "@server/routers/site";
import { getTranslations } from 'next-intl/server';

interface ResourceLayoutProps {
    children: React.ReactNode;
    params: Promise<{ niceId: string; orgId: string }>;
}

export default async function ResourceLayout(props: ResourceLayoutProps) {
    const params = await props.params;
    const t = await getTranslations();

    const { children } = props;

    let authInfo = null;
    let resource = null;
    try {
        const res = await internal.get<AxiosResponse<GetResourceResponse>>(
            `/org/${params.orgId}/resource/${params.niceId}`,
            await authCookieHeader()
        );
        resource = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }

    if (!resource) {
        redirect(`/${params.orgId}/settings/resources`);
    }

    try {
        const res = await internal.get<
            AxiosResponse<GetResourceAuthInfoResponse>
        >(`/resource/${resource.resourceGuid}/auth`, await authCookieHeader());
        authInfo = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }

    if (!authInfo) {
        redirect(`/${params.orgId}/settings/resources`);
    }

    let org = null;
    try {
        const getOrg = cache(async () =>
            internal.get<AxiosResponse<GetOrgResponse>>(
                `/org/${params.orgId}`,
                await authCookieHeader()
            )
        );
        const res = await getOrg();
        org = res.data.data;
    } catch {
        redirect(`/${params.orgId}/settings/resources`);
    }

    if (!org) {
        redirect(`/${params.orgId}/settings/resources`);
    }

    const navItems = [
        {
            title: t('general'),
            href: `/{orgId}/settings/resources/{niceId}/general`
        },
        {
            title: t('proxy'),
            href: `/{orgId}/settings/resources/{niceId}/proxy`
        }
    ];

    if (resource.http) {
        navItems.push({
            title: t('authentication'),
            href: `/{orgId}/settings/resources/{niceId}/authentication`
        });
        navItems.push({
            title: t('rules'),
            href: `/{orgId}/settings/resources/{niceId}/rules`
        });
    }

    return (
        <>
            <SettingsSectionTitle
                title={t('resourceSetting', {resourceName: resource?.name})}
                description={t('resourceSettingDescription')}
            />

            <OrgProvider org={org}>
                <ResourceProvider
                    resource={resource}
                    authInfo={authInfo}
                >
                    <div className="space-y-6">
                        <ResourceInfoBox />
                        <HorizontalTabs items={navItems}>
                            {children}
                        </HorizontalTabs>
                    </div>
                </ResourceProvider>
            </OrgProvider>
        </>
    );
}
