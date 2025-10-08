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

"use client";
import { Button } from "@app/components/ui/button";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { useRouter } from "next/navigation";
import {
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm
} from "@app/components/Settings";
import { useTranslations } from "next-intl";
import { GetLoginPageResponse } from "@server/routers/private/loginPage";
import { ListDomainsResponse } from "@server/routers/domain";
import { DomainRow } from "@app/components/DomainsTable";
import { toUnicode } from "punycode";
import { Globe, Trash2 } from "lucide-react";
import CertificateStatus from "@app/components/private/CertificateStatus";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import DomainPicker from "@app/components/DomainPicker";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { InfoPopup } from "@app/components/ui/info-popup";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { usePrivateSubscriptionStatusContext } from "@app/hooks/privateUseSubscriptionStatusContext";
import { TierId } from "@server/lib/private/billing/tiers";
import { build } from "@server/build";

// Auth page form schema
const AuthPageFormSchema = z.object({
    authPageDomainId: z.string().optional(),
    authPageSubdomain: z.string().optional()
});

type AuthPageFormValues = z.infer<typeof AuthPageFormSchema>;

interface AuthPageSettingsProps {
    onSaveSuccess?: () => void;
    onSaveError?: (error: any) => void;
}

export interface AuthPageSettingsRef {
    saveAuthSettings: () => Promise<void>;
    hasUnsavedChanges: () => boolean;
}

const AuthPageSettings = forwardRef<AuthPageSettingsRef, AuthPageSettingsProps>(({ 
    onSaveSuccess, 
    onSaveError 
}, ref) => {
    const { org } = useOrgContext();
    const api = createApiClient(useEnvContext());
    const router = useRouter();
    const t = useTranslations();

    const subscription = usePrivateSubscriptionStatusContext();
    const subscribed = subscription?.getTier() === TierId.STANDARD;

    // Auth page domain state
    const [loginPage, setLoginPage] = useState<GetLoginPageResponse | null>(
        null
    );
    const [loginPageExists, setLoginPageExists] = useState(false);
    const [editDomainOpen, setEditDomainOpen] = useState(false);
    const [baseDomains, setBaseDomains] = useState<DomainRow[]>([]);
    const [selectedDomain, setSelectedDomain] = useState<{
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
    } | null>(null);
    const [loadingLoginPage, setLoadingLoginPage] = useState(true);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [loadingSave, setLoadingSave] = useState(false);

    const form = useForm({
        resolver: zodResolver(AuthPageFormSchema),
        defaultValues: {
            authPageDomainId: loginPage?.domainId || "",
            authPageSubdomain: loginPage?.subdomain || ""
        },
        mode: "onChange"
    });

    // Expose save function to parent component
    useImperativeHandle(ref, () => ({
        saveAuthSettings: async () => {
            await form.handleSubmit(onSubmit)();
        },
        hasUnsavedChanges: () => hasUnsavedChanges
    }), [form, hasUnsavedChanges]);

    // Fetch login page and domains data
    useEffect(() => {
        if (build !== "saas") { 
            return;
        }

        const fetchLoginPage = async () => {
            try {
                const res = await api.get<AxiosResponse<GetLoginPageResponse>>(
                    `/org/${org?.org.orgId}/login-page`
                );
                if (res.status === 200) {
                    setLoginPage(res.data.data);
                    setLoginPageExists(true);
                    // Update form with login page data
                    form.setValue(
                        "authPageDomainId",
                        res.data.data.domainId || ""
                    );
                    form.setValue(
                        "authPageSubdomain",
                        res.data.data.subdomain || ""
                    );
                }
            } catch (err) {
                // Login page doesn't exist yet, that's okay
                setLoginPage(null);
                setLoginPageExists(false);
            } finally {
                setLoadingLoginPage(false);
            }
        };

        const fetchDomains = async () => {
            try {
                const res = await api.get<AxiosResponse<ListDomainsResponse>>(
                    `/org/${org?.org.orgId}/domains/`
                );
                if (res.status === 200) {
                    const rawDomains = res.data.data.domains as DomainRow[];
                    const domains = rawDomains.map((domain) => ({
                        ...domain,
                        baseDomain: toUnicode(domain.baseDomain)
                    }));
                    setBaseDomains(domains);
                }
            } catch (err) {
                console.error("Failed to fetch domains:", err);
            }
        };

        if (org?.org.orgId) {
            fetchLoginPage();
            fetchDomains();
        }
    }, []);

    // Handle domain selection from modal
    function handleDomainSelection(domain: {
        domainId: string;
        subdomain?: string;
        fullDomain: string;
        baseDomain: string;
    }) {
        form.setValue("authPageDomainId", domain.domainId);
        form.setValue("authPageSubdomain", domain.subdomain || "");
        setEditDomainOpen(false);

        // Update loginPage state to show the selected domain immediately
        const sanitizedSubdomain = domain.subdomain
            ? finalizeSubdomainSanitize(domain.subdomain)
            : "";

        const sanitizedFullDomain = sanitizedSubdomain
            ? `${sanitizedSubdomain}.${domain.baseDomain}`
            : domain.baseDomain;

        // Only update loginPage state if a login page already exists
        if (loginPageExists && loginPage) {
            setLoginPage({
                ...loginPage,
                domainId: domain.domainId,
                subdomain: sanitizedSubdomain,
                fullDomain: sanitizedFullDomain
            });
        }

        setHasUnsavedChanges(true);
    }

    // Clear auth page domain
    function clearAuthPageDomain() {
        form.setValue("authPageDomainId", "");
        form.setValue("authPageSubdomain", "");
        setLoginPage(null);
        setHasUnsavedChanges(true);
    }

    async function onSubmit(data: AuthPageFormValues) {
        setLoadingSave(true);

        try {
            // Handle auth page domain
            if (data.authPageDomainId) {
                if (build !== "saas" || (build === "saas" && subscribed)) {
                    const sanitizedSubdomain = data.authPageSubdomain
                        ? finalizeSubdomainSanitize(data.authPageSubdomain)
                        : "";

                    if (loginPageExists) {
                        // Login page exists on server - need to update it
                        // First, we need to get the loginPageId from the server since loginPage might be null locally
                        let loginPageId: number;

                        if (loginPage) {
                            // We have the loginPage data locally
                            loginPageId = loginPage.loginPageId;
                        } else {
                            // User cleared selection locally, but login page still exists on server
                            // We need to fetch it to get the loginPageId
                            const fetchRes = await api.get<
                                AxiosResponse<GetLoginPageResponse>
                            >(`/org/${org?.org.orgId}/login-page`);
                            loginPageId = fetchRes.data.data.loginPageId;
                        }

                        // Update existing auth page domain
                        const updateRes = await api.post(
                            `/org/${org?.org.orgId}/login-page/${loginPageId}`,
                            {
                                domainId: data.authPageDomainId,
                                subdomain: sanitizedSubdomain || null
                            }
                        );

                        if (updateRes.status === 201) {
                            setLoginPage(updateRes.data.data);
                            setLoginPageExists(true);
                        }
                    } else {
                        // No login page exists on server - create new one
                        const createRes = await api.put(
                            `/org/${org?.org.orgId}/login-page`,
                            {
                                domainId: data.authPageDomainId,
                                subdomain: sanitizedSubdomain || null
                            }
                        );

                        if (createRes.status === 201) {
                            setLoginPage(createRes.data.data);
                            setLoginPageExists(true);
                        }
                    }
                }
            } else if (loginPageExists) {
                // Delete existing auth page domain if no domain selected
                let loginPageId: number;

                if (loginPage) {
                    // We have the loginPage data locally
                    loginPageId = loginPage.loginPageId;
                } else {
                    // User cleared selection locally, but login page still exists on server
                    // We need to fetch it to get the loginPageId
                    const fetchRes = await api.get<
                        AxiosResponse<GetLoginPageResponse>
                    >(`/org/${org?.org.orgId}/login-page`);
                    loginPageId = fetchRes.data.data.loginPageId;
                }

                await api.delete(
                    `/org/${org?.org.orgId}/login-page/${loginPageId}`
                );
                setLoginPage(null);
                setLoginPageExists(false);
            }

            setHasUnsavedChanges(false);
            router.refresh();
            onSaveSuccess?.();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("authPageErrorUpdate"),
                description: formatAxiosError(e, t("authPageErrorUpdateMessage"))
            });
            onSaveError?.(e);
        } finally {
            setLoadingSave(false);
        }
    }

    return (
        <>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("authPage")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("authPageDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    {build === "saas" && !subscribed ? (
                        <Alert variant="info" className="mb-6">
                            <AlertDescription>
                                {t("orgAuthPageDisabled")}{" "}
                                {t("subscriptionRequiredToUse")}
                            </AlertDescription>
                        </Alert>
                    ) : null}

                    <SettingsSectionForm>
                        {loadingLoginPage ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="text-sm text-muted-foreground">
                                    {t("loading")}
                                </div>
                            </div>
                        ) : (
                            <Form {...form}>
                                <form
                                    onSubmit={form.handleSubmit(onSubmit)}
                                    className="space-y-4"
                                    id="auth-page-settings-form"
                                >
                                    <div className="space-y-3">
                                        <Label>{t("authPageDomain")}</Label>
                                        <div className="border p-2 rounded-md flex items-center justify-between">
                                            <span className="text-sm text-muted-foreground flex items-center gap-2">
                                                <Globe size="14" />
                                                {loginPage &&
                                                !loginPage.domainId ? (
                                                    <InfoPopup
                                                        info={t(
                                                            "domainNotFoundDescription"
                                                        )}
                                                        text={t("domainNotFound")}
                                                    />
                                                ) : loginPage?.fullDomain ? (
                                                    <a
                                                        href={`${window.location.protocol}//${loginPage.fullDomain}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="hover:underline"
                                                    >
                                                        {`${window.location.protocol}//${loginPage.fullDomain}`}
                                                    </a>
                                                ) : form.watch(
                                                      "authPageDomainId"
                                                  ) ? (
                                                    // Show selected domain from form state when no loginPage exists yet
                                                    (() => {
                                                        const selectedDomainId =
                                                            form.watch(
                                                                "authPageDomainId"
                                                            );
                                                        const selectedSubdomain =
                                                            form.watch(
                                                                "authPageSubdomain"
                                                            );
                                                        const domain =
                                                            baseDomains.find(
                                                                (d) =>
                                                                    d.domainId ===
                                                                    selectedDomainId
                                                            );
                                                        if (domain) {
                                                            const sanitizedSubdomain =
                                                                selectedSubdomain
                                                                    ? finalizeSubdomainSanitize(
                                                                          selectedSubdomain
                                                                      )
                                                                    : "";
                                                            const fullDomain =
                                                                sanitizedSubdomain
                                                                    ? `${sanitizedSubdomain}.${domain.baseDomain}`
                                                                    : domain.baseDomain;
                                                            return fullDomain;
                                                        }
                                                        return t("noDomainSet");
                                                    })()
                                                ) : (
                                                    t("noDomainSet")
                                                )}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    variant="secondary"
                                                    type="button"
                                                    size="sm"
                                                    onClick={() =>
                                                        setEditDomainOpen(true)
                                                    }
                                                >
                                                    {form.watch("authPageDomainId")
                                                        ? t("changeDomain")
                                                        : t("selectDomain")}
                                                </Button>
                                                {form.watch("authPageDomainId") && (
                                                    <Button
                                                        variant="destructive"
                                                        type="button"
                                                        size="sm"
                                                        onClick={
                                                            clearAuthPageDomain
                                                        }
                                                    >
                                                        <Trash2 size="14" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Certificate Status */}
                                        {(build !== "saas" ||
                                            (build === "saas" && subscribed)) &&
                                            loginPage?.domainId &&
                                            loginPage?.fullDomain &&
                                            !hasUnsavedChanges && (
                                                <CertificateStatus
                                                    orgId={org?.org.orgId || ""}
                                                    domainId={loginPage.domainId}
                                                    fullDomain={
                                                        loginPage.fullDomain
                                                    }
                                                    autoFetch={true}
                                                    showLabel={true}
                                                    polling={true}
                                                />
                                            )}

                                        {!form.watch("authPageDomainId") && (
                                            <div className="text-sm text-muted-foreground">
                                                {t(
                                                    "addDomainToEnableCustomAuthPages"
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </form>
                            </Form>
                        )}
                    </SettingsSectionForm>
                </SettingsSectionBody>
            </SettingsSection>

            {/* Domain Picker Modal */}
            <Credenza
                open={editDomainOpen}
                onOpenChange={(setOpen) => setEditDomainOpen(setOpen)}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>
                            {loginPage
                                ? t("editAuthPageDomain")
                                : t("setAuthPageDomain")}
                        </CredenzaTitle>
                        <CredenzaDescription>
                            {t("selectDomainForOrgAuthPage")}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <DomainPicker
                            hideFreeDomain={true}
                            orgId={org?.org.orgId as string}
                            cols={1}
                            onDomainChange={(res) => {
                                const selected = {
                                    domainId: res.domainId,
                                    subdomain: res.subdomain,
                                    fullDomain: res.fullDomain,
                                    baseDomain: res.baseDomain
                                };
                                setSelectedDomain(selected);
                            }}
                        />
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("cancel")}</Button>
                        </CredenzaClose>
                        <Button
                            onClick={() => {
                                if (selectedDomain) {
                                    handleDomainSelection(selectedDomain);
                                }
                            }}
                            disabled={!selectedDomain}
                        >
                            {t("selectDomain")}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
});

AuthPageSettings.displayName = 'AuthPageSettings';

export default AuthPageSettings;