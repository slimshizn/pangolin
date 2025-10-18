import { internal, priv } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import IdpTable, { IdpRow } from "@app/components/private/OrgIdpTable";
import { getTranslations } from "next-intl/server";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { cache } from "react";
import {
    GetOrgSubscriptionResponse,
    GetOrgTierResponse
} from "@server/routers/billing/types";
import { TierId } from "@server/lib/billing/tiers";
import { build } from "@server/build";

type OrgIdpPageProps = {
    params: Promise<{ orgId: string }>;
};

export const dynamic = "force-dynamic";

export default async function OrgIdpPage(props: OrgIdpPageProps) {
    const params = await props.params;

    let idps: IdpRow[] = [];
    try {
        const res = await internal.get<AxiosResponse<{ idps: IdpRow[] }>>(
            `/org/${params.orgId}/idp`,
            await authCookieHeader()
        );
        idps = res.data.data.idps;
    } catch (e) {
        console.error(e);
    }

    const t = await getTranslations();

    let subscriptionStatus: GetOrgTierResponse | null = null;
    try {
        const getSubscription = cache(() =>
            priv.get<AxiosResponse<GetOrgTierResponse>>(
                `/org/${params.orgId}/billing/tier`
            )
        );
        const subRes = await getSubscription();
        subscriptionStatus = subRes.data.data;
    } catch {}
    const subscribed =
        build === "enterprise"
            ? true
            : subscriptionStatus?.tier === TierId.STANDARD;

    return (
        <>
            <SettingsSectionTitle
                title={t("idpManage")}
                description={t("idpManageDescription")}
            />

            {build === "saas" && !subscribed ? (
                <Alert variant="info" className="mb-6">
                    <AlertDescription>
                        {t("idpDisabled")} {t("subscriptionRequiredToUse")}
                    </AlertDescription>
                </Alert>
            ) : null}

            <IdpTable idps={idps} orgId={params.orgId} />
        </>
    );
}
