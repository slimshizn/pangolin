"use client";

import { useEffect, useState } from "react";
import { Button } from "@app/components/ui/button";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
    generateOidcUrlProxy,
    type GenerateOidcUrlResponse
} from "@app/actions/server";
import {
    redirect as redirectTo,
    useParams,
    useSearchParams
} from "next/navigation";
import { useRouter } from "next/navigation";

export type LoginFormIDP = {
    idpId: number;
    name: string;
    variant?: string;
};

type IdpLoginButtonsProps = {
    idps: LoginFormIDP[];
    redirect?: string;
    orgId?: string;
};

export default function IdpLoginButtons({
    idps,
    redirect,
    orgId
}: IdpLoginButtonsProps) {
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const t = useTranslations();

    const params = useSearchParams();
    const router = useRouter();

    function goToApp() {
        const url = window.location.href.split("?")[0];
        router.push(url);
    }

    useEffect(() => {
        if (params.get("gotoapp")) {
            goToApp();
        }
    }, []);

    async function loginWithIdp(idpId: number) {
        setLoading(true);
        setError(null);

        let redirectToUrl: string | undefined;
        try {
            const response = await generateOidcUrlProxy(
                idpId,
                redirect || "/auth/org?gotoapp=app",
                orgId
            );

            if (response.error) {
                setError(response.message);
                setLoading(false);
                return;
            }

            const data = response.data;
            console.log("Redirecting to:", data?.redirectUrl);
            if (data?.redirectUrl) {
                redirectToUrl = data.redirectUrl;
            }
        } catch (e: any) {
            console.error(e);
            setError(
                t("loginError", {
                    defaultValue:
                        "An unexpected error occurred. Please try again."
                })
            );
            setLoading(false);
        }

        if (redirectToUrl) {
            redirectTo(redirectToUrl);
        }
    }

    if (!idps || idps.length === 0) {
        return null;
    }

    return (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="space-y-2">
                {params.get("gotoapp") ? (
                    <>
                        <Button
                            type="button"
                            className="w-full"
                            onClick={() => {
                                goToApp();
                            }}
                        >
                            {t("continueToApplication")}
                        </Button>
                    </>
                ) : (
                    <>
                        {idps.map((idp) => {
                            const effectiveType =
                                idp.variant || idp.name.toLowerCase();

                            return (
                                <Button
                                    key={idp.idpId}
                                    type="button"
                                    variant="outline"
                                    className="w-full inline-flex items-center space-x-2"
                                    onClick={() => {
                                        loginWithIdp(idp.idpId);
                                    }}
                                    disabled={loading}
                                >
                                    {effectiveType === "google" && (
                                        <Image
                                            src="/idp/google.png"
                                            alt="Google"
                                            width={16}
                                            height={16}
                                            className="rounded"
                                        />
                                    )}
                                    {effectiveType === "azure" && (
                                        <Image
                                            src="/idp/azure.png"
                                            alt="Azure"
                                            width={16}
                                            height={16}
                                            className="rounded"
                                        />
                                    )}
                                    <span>{idp.name}</span>
                                </Button>
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}
