import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import { cache } from "react";
import ResetPasswordForm from "@app/components/ResetPasswordForm";
import Link from "next/link";
import { cleanRedirect } from "@app/lib/cleanRedirect";
import { getTranslations } from "next-intl/server";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";

export const dynamic = "force-dynamic";

export default async function Page(props: {
    searchParams: Promise<{
        redirect: string | undefined;
        email: string | undefined;
        token: string | undefined;
        quickstart?: string | undefined;
    }>;
}) {
    const searchParams = await props.searchParams;
    const getUser = cache(verifySession);
    const user = await getUser();
    const t = await getTranslations();

    if (user) {
        let loggedOut = false;
        try {
            // log out the user if they are logged in
            await internal.post(
                "/auth/logout",
                undefined,
                await authCookieHeader()
            );
            loggedOut = true;
        } catch (e) {}
        if (!loggedOut) {
            redirect("/");
        }
    }

    let redirectUrl: string | undefined = undefined;
    if (searchParams.redirect) {
        redirectUrl = cleanRedirect(searchParams.redirect);
    }

    return (
        <>
            <ResetPasswordForm
                redirect={searchParams.redirect}
                tokenParam={searchParams.token}
                emailParam={searchParams.email}
                quickstart={
                    searchParams.quickstart === "true" ? true : undefined
                }
            />

            <p className="text-center text-muted-foreground mt-4">
                <Link
                    href={
                        !searchParams.redirect
                            ? `/auth/login`
                            : `/auth/login?redirect=${redirectUrl}`
                    }
                    className="underline"
                >
                    {t("loginBack")}
                </Link>
            </p>
        </>
    );
}
