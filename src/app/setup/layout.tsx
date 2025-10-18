import { Layout } from "@app/components/Layout";
import ProfileIcon from "@app/components/ProfileIcon";
import { verifySession } from "@app/lib/auth/verifySession";
import { pullEnv } from "@app/lib/pullEnv";
import UserProvider from "@app/providers/UserProvider";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ListUserOrgsResponse } from "@server/routers/org";
import { internal } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { authCookieHeader } from "@app/lib/api/cookies";

export const metadata: Metadata = {
    title: `Setup - ${process.env.BRANDING_APP_NAME || "Pangolin"}`,
    description: ""
};

export const dynamic = "force-dynamic";

export default async function SetupLayout({
    children
}: {
    children: React.ReactNode;
}) {
    const getUser = cache(verifySession);
    const user = await getUser();

    const env = pullEnv();

    if (!user) {
        redirect("/?redirect=/setup");
    }

    if (!(!env.flags.disableUserCreateOrg || user.serverAdmin)) {
        redirect("/");
    }

    let orgs: ListUserOrgsResponse["orgs"] = [];
    try {
        const getOrgs = cache(async () =>
            internal.get<AxiosResponse<ListUserOrgsResponse>>(
                `/user/${user.userId}/orgs`,
                await authCookieHeader()
            )
        );
        const res = await getOrgs();
        if (res && res.data.data.orgs) {
            orgs = res.data.data.orgs;
        }
    } catch (e) {}

    return (
        <>
            <UserProvider user={user}>
                <Layout navItems={[]} orgs={orgs}>
                    <div className="w-full max-w-2xl mx-auto md:mt-32 mt-4">
                        {children}
                    </div>
                </Layout>
            </UserProvider>
        </>
    );
}
