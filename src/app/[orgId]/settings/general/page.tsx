"use client";
import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import AuthPageSettings, { AuthPageSettingsRef } from "@app/components/private/AuthPageSettings";

import { Button } from "@app/components/ui/button";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { userOrgUserContext } from "@app/hooks/useOrgUserContext";
import { toast } from "@app/hooks/useToast";
import { useState, useRef } from "react";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { DeleteOrgResponse, ListUserOrgsResponse } from "@server/routers/org";
import { useRouter } from "next/navigation";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm,
    SettingsSectionFooter
} from "@app/components/Settings";
import { useUserContext } from "@app/hooks/useUserContext";
import { useTranslations } from "next-intl";
import { build } from "@server/build";

// Schema for general organization settings
const GeneralFormSchema = z.object({
    name: z.string(),
    subnet: z.string().optional()
});

type GeneralFormValues = z.infer<typeof GeneralFormSchema>;

export default function GeneralPage() {
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const { orgUser } = userOrgUserContext();
    const router = useRouter();
    const { org } = useOrgContext();
    const api = createApiClient(useEnvContext());
    const { user } = useUserContext();
    const t = useTranslations();
    const { env } = useEnvContext();

    const [loadingDelete, setLoadingDelete] = useState(false);
    const [loadingSave, setLoadingSave] = useState(false);
    const authPageSettingsRef = useRef<AuthPageSettingsRef>(null);

    const form = useForm({
        resolver: zodResolver(GeneralFormSchema),
        defaultValues: {
            name: org?.org.name,
            subnet: org?.org.subnet || "" // Add default value for subnet
        },
        mode: "onChange"
    });

    async function deleteOrg() {
        setLoadingDelete(true);
        try {
            const res = await api.delete<AxiosResponse<DeleteOrgResponse>>(
                `/org/${org?.org.orgId}`
            );
            toast({
                title: t("orgDeleted"),
                description: t("orgDeletedMessage")
            });
            if (res.status === 200) {
                pickNewOrgAndNavigate();
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t("orgErrorDelete"),
                description: formatAxiosError(err, t("orgErrorDeleteMessage"))
            });
        } finally {
            setLoadingDelete(false);
        }
    }

    async function pickNewOrgAndNavigate() {
        try {
            const res = await api.get<AxiosResponse<ListUserOrgsResponse>>(
                `/user/${user.userId}/orgs`
            );

            if (res.status === 200) {
                if (res.data.data.orgs.length > 0) {
                    const orgId = res.data.data.orgs[0].orgId;
                    // go to `/${orgId}/settings`);
                    router.push(`/${orgId}/settings`);
                } else {
                    // go to `/setup`
                    router.push("/setup");
                }
            }
        } catch (err) {
            console.error(err);
            toast({
                variant: "destructive",
                title: t("orgErrorFetch"),
                description: formatAxiosError(err, t("orgErrorFetchMessage"))
            });
        }
    }

    async function onSubmit(data: GeneralFormValues) {
        setLoadingSave(true);

        try {
            // Update organization
            await api.post(`/org/${org?.org.orgId}`, {
                name: data.name
                // subnet: data.subnet // Include subnet in the API request
            });

            // Also save auth page settings if they have unsaved changes
            if (build === "saas" && authPageSettingsRef.current?.hasUnsavedChanges()) {
                await authPageSettingsRef.current.saveAuthSettings();
            }

            toast({
                title: t("orgUpdated"),
                description: t("orgUpdatedDescription")
            });
            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("orgErrorUpdate"),
                description: formatAxiosError(e, t("orgErrorUpdateMessage"))
            });
        } finally {
            setLoadingSave(false);
        }
    }

    return (
        <SettingsContainer>
            <ConfirmDeleteDialog
                open={isDeleteModalOpen}
                setOpen={(val) => {
                    setIsDeleteModalOpen(val);
                }}
                dialog={
                    <div>
                        <p className="mb-2">
                            {t("orgQuestionRemove", {
                                selectedOrg: org?.org.name
                            })}
                        </p>
                        <p className="mb-2">{t("orgMessageRemove")}</p>
                        <p>{t("orgMessageConfirm")}</p>
                    </div>
                }
                buttonText={t("orgDeleteConfirm")}
                onConfirm={deleteOrg}
                string={org?.org.name || ""}
                title={t("orgDelete")}
            />
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("orgGeneralSettings")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("orgGeneralSettingsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>
                <SettingsSectionBody>
                    <SettingsSectionForm>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="org-settings-form"
                            >
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("name")}</FormLabel>
                                            <FormControl>
                                                <Input {...field} />
                                            </FormControl>
                                            <FormMessage />
                                            <FormDescription>
                                                {t("orgDisplayName")}
                                            </FormDescription>
                                        </FormItem>
                                    )}
                                />
                                {env.flags.enableClients && (
                                    <FormField
                                        control={form.control}
                                        name="subnet"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("subnet")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        disabled={true}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                                <FormDescription>
                                                    {t("subnetDescription")}
                                                </FormDescription>
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </form>
                        </Form>
                    </SettingsSectionForm>
                </SettingsSectionBody>
            </SettingsSection>

            {build === "saas" && <AuthPageSettings ref={authPageSettingsRef} />}

            {/* Save Button */}
            <div className="flex justify-end">
                <Button
                    type="submit"
                    form="org-settings-form"
                    loading={loadingSave}
                    disabled={loadingSave}
                >
                    {t("saveGeneralSettings")}
                </Button>
            </div>

            {build !== "saas" && (
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("orgDangerZone")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("orgDangerZoneDescription")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionFooter>
                        <Button
                            variant="destructive"
                            onClick={() => setIsDeleteModalOpen(true)}
                            className="flex items-center gap-2"
                            loading={loadingDelete}
                            disabled={loadingDelete}
                        >
                            {t("orgDelete")}
                        </Button>
                    </SettingsSectionFooter>
                </SettingsSection>
            )}

        </SettingsContainer>
    );
}
