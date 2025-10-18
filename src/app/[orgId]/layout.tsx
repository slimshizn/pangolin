import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { verifySession } from "@app/lib/auth/verifySession";
import { GetOrgResponse } from "@server/routers/org";
import { GetOrgUserResponse } from "@server/routers/user";
import { AxiosResponse } from "axios";
import { redirect } from "next/navigation";
import { cache } from "react";
import SetLastOrgCookie from "@app/components/SetLastOrgCookie";
import SubscriptionStatusProvider from "@app/providers/SubscriptionStatusProvider";
import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { pullEnv } from "@app/lib/pullEnv";
import { build } from "@server/build";

export default async function OrgLayout(props: {
    children: React.ReactNode;
    params: Promise<{ orgId: string }>;
}) {
    const cookie = await authCookieHeader();
    const params = await props.params;
    const orgId = params.orgId;
    const env = pullEnv();

    if (!orgId) {
        redirect(`/`);
    }

    const getUser = cache(verifySession);
    const user = await getUser();

    if (!user) {
        redirect(`/`);
    }

    try {
        const getOrgUser = cache(() =>
            internal.get<AxiosResponse<GetOrgUserResponse>>(
                `/org/${orgId}/user/${user.userId}`,
                cookie
            )
        );
        const orgUser = await getOrgUser();
    } catch {
        redirect(`/`);
    }

    try {
        const getOrg = cache(() =>
            internal.get<AxiosResponse<GetOrgResponse>>(`/org/${orgId}`, cookie)
        );
        await getOrg();
    } catch {
        redirect(`/`);
    }

    let subscriptionStatus = null;
    if (build === "saas") {
        try {
            const getSubscription = cache(() =>
                internal.get<AxiosResponse<GetOrgSubscriptionResponse>>(
                    `/org/${orgId}/billing/subscription`,
                    cookie
                )
            );
            const subRes = await getSubscription();
            subscriptionStatus = subRes.data.data;
        } catch (error) {
            // If subscription fetch fails, keep subscriptionStatus as null
            console.error("Failed to fetch subscription status:", error);
        }
    }

    return (
        <SubscriptionStatusProvider
            subscriptionStatus={subscriptionStatus}
            env={env.app.environment}
            sandbox_mode={env.app.sandbox_mode}
        >
            {props.children}
            <SetLastOrgCookie orgId={orgId} />
        </SubscriptionStatusProvider>
    );
}
