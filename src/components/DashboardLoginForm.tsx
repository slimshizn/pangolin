"use client";

import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { createApiClient } from "@app/lib/api";
import LoginForm, { LoginFormIDP } from "@app/components/LoginForm";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Image from "next/image";
import { cleanRedirect } from "@app/lib/cleanRedirect";
import BrandingLogo from "@app/components/BrandingLogo";
import { useTranslations } from "next-intl";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";

type DashboardLoginFormProps = {
    redirect?: string;
    idps?: LoginFormIDP[];
};

export default function DashboardLoginForm({
    redirect,
    idps
}: DashboardLoginFormProps) {
    const router = useRouter();
    const { env } = useEnvContext();
    const t = useTranslations();
    const { isUnlocked } = useLicenseStatusContext();

    function getSubtitle() {
        return t("loginStart");
    }

    const logoWidth = isUnlocked() ? env.branding.logo?.authPage?.width || 175 : 175;
    const logoHeight = isUnlocked() ? env.branding.logo?.authPage?.height || 58 : 58;

    return (
        <Card className="shadow-md w-full max-w-md">
            <CardHeader className="border-b">
                <div className="flex flex-row items-center justify-center">
                    <BrandingLogo
                        height={logoHeight}
                        width={logoWidth}
                    />
                </div>
                <div className="text-center space-y-1 pt-3">
                    <p className="text-muted-foreground">{getSubtitle()}</p>
                </div>
            </CardHeader>
            <CardContent className="pt-6">
                <LoginForm
                    redirect={redirect}
                    idps={idps}
                    onLogin={() => {
                        if (redirect) {
                            const safe = cleanRedirect(redirect);
                            router.push(safe);
                        } else {
                            router.push("/");
                        }
                    }}
                />
            </CardContent>
        </Card>
    );
}
