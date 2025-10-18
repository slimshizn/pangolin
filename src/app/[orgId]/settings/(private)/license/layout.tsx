import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getTranslations } from "next-intl/server";
import { build } from "@server/build";

type LicensesSettingsProps = {
    children: React.ReactNode;
    params: Promise<{ orgId: string }>;
};

export default async function LicensesSetingsLayoutProps({
    children,
    params
}: LicensesSettingsProps) {
    const { orgId } = await params;

    if (build !== "saas") {
        redirect(`/${orgId}/settings`);
    }

    const getUser = cache(verifySession);
    const user = await getUser();

    if (!user) {
        redirect(`/`);
    }

    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("saasLicenseKeysSettingsTitle")}
                description={t("saasLicenseKeysSettingsDescription")}
            />

            {children}
        </>
    );
}
