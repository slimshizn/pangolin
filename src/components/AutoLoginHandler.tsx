"use client";

import { useEffect, useState } from "react";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { redirect, useRouter } from "next/navigation";
import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    CardDescription
} from "@app/components/ui/card";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { generateOidcUrlProxy } from "@app/actions/server";

type AutoLoginHandlerProps = {
    resourceId: number;
    skipToIdpId: number;
    redirectUrl: string;
    orgId?: string;
};

export default function AutoLoginHandler({
    resourceId,
    skipToIdpId,
    redirectUrl,
    orgId
}: AutoLoginHandlerProps) {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const router = useRouter();
    const t = useTranslations();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function initiateAutoLogin() {
            setLoading(true);

            let doRedirect: string | undefined;
            try {
                const response = await generateOidcUrlProxy(
                    skipToIdpId,
                    redirectUrl,
                    orgId
                );

                if (response.error) {
                    setError(response.message);
                    setLoading(false);
                    return;
                }

                const data = response.data;
                const url = data?.redirectUrl;
                if (url) {
                    doRedirect = url;
                } else {
                    setError(t("autoLoginErrorNoRedirectUrl"));
                }
            } catch (e: any) {
                console.error("Failed to generate OIDC URL:", e);
                setError(
                    t("autoLoginErrorGeneratingUrl", {
                        defaultValue: "An unexpected error occurred. Please try again."
                    })
                );
            } finally {
                setLoading(false);
                if (doRedirect) {
                    redirect(doRedirect);
                }
            }
        }

        initiateAutoLogin();
    }, []);

    return (
        <div className="flex items-center justify-center min-h-screen">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>{t("autoLoginTitle")}</CardTitle>
                    <CardDescription>
                        {t("autoLoginDescription")}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center space-y-4">
                    {loading && (
                        <div className="flex items-center space-x-2">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            <span>{t("autoLoginProcessing")}</span>
                        </div>
                    )}
                    {!loading && !error && (
                        <div className="flex items-center space-x-2 text-green-600">
                            <CheckCircle2 className="h-5 w-5" />
                            <span>{t("autoLoginRedirecting")}</span>
                        </div>
                    )}
                    {error && (
                        <Alert variant="destructive" className="w-full">
                            <AlertCircle className="h-5 w-5" />
                            <AlertDescription className="flex flex-col space-y-2">
                                <span>{t("autoLoginError")}</span>
                                <span className="text-xs">{error}</span>
                            </AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
