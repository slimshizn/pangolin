"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
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
import { useClientContext } from "@app/hooks/useClientContext";
import { useForm } from "react-hook-form";
import { toast } from "@app/hooks/useToast";
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
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useEffect, useState } from "react";
import { Tag, TagInput } from "@app/components/tags/tag-input";
import { AxiosResponse } from "axios";
import { ListSitesResponse } from "@server/routers/site";
import { useTranslations } from "next-intl";

const GeneralFormSchema = z.object({
    name: z.string().nonempty("Name is required"),
    siteIds: z.array(
        z.object({
            id: z.string(),
            text: z.string()
        })
    )
});

type GeneralFormValues = z.infer<typeof GeneralFormSchema>;

export default function GeneralPage() {
    const t = useTranslations();
    const { client, updateClient } = useClientContext();
    const api = createApiClient(useEnvContext());
    const [loading, setLoading] = useState(false);
    const router = useRouter();
    const [sites, setSites] = useState<Tag[]>([]);
    const [clientSites, setClientSites] = useState<Tag[]>([]);
    const [activeSitesTagIndex, setActiveSitesTagIndex] = useState<number | null>(null);

    const form = useForm({
        resolver: zodResolver(GeneralFormSchema),
        defaultValues: {
            name: client?.name,
            siteIds: []
        },
        mode: "onChange"
    });

    // Fetch available sites and client's assigned sites
    useEffect(() => {
        const fetchSites = async () => {
            try {
                // Fetch all available sites
                const res = await api.get<AxiosResponse<ListSitesResponse>>(
                    `/org/${client?.orgId}/sites/`
                );
                
                const availableSites = res.data.data.sites
                    .filter((s) => s.type === "newt" && s.subnet)
                    .map((site) => ({
                        id: site.siteId.toString(),
                        text: site.name
                    }));
                
                setSites(availableSites);

                // Filter sites to only include those assigned to the client
                const assignedSites = availableSites.filter((site) =>
                    client?.siteIds?.includes(parseInt(site.id))
                );
                setClientSites(assignedSites);
                // Set the default values for the form
                form.setValue("siteIds", assignedSites);
            } catch (e) {
                toast({
                    variant: "destructive",
                    title: "Failed to fetch sites",
                    description: formatAxiosError(
                        e,
                        "An error occurred while fetching sites."
                    )
                });
            }
        };

        if (client?.clientId) {
            fetchSites();
        }
    }, [client?.clientId, client?.orgId, api, form]);

    async function onSubmit(data: GeneralFormValues) {
        setLoading(true);

        try {
            await api.post(`/client/${client?.clientId}`, {
                name: data.name,
                siteIds: data.siteIds.map(site => parseInt(site.id))
            });

            updateClient({ name: data.name });

            toast({
                title: t("clientUpdated"),
                description: t("clientUpdatedDescription")
            });

            router.refresh();
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("clientUpdateFailed"),
                description: formatAxiosError(
                    e,
                    t("clientUpdateError")
                )
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <SettingsContainer>
            <SettingsSection>
                <SettingsSectionHeader>
                    <SettingsSectionTitle>
                        {t("generalSettings")}
                    </SettingsSectionTitle>
                    <SettingsSectionDescription>
                        {t("generalSettingsDescription")}
                    </SettingsSectionDescription>
                </SettingsSectionHeader>

                <SettingsSectionBody>
                    <SettingsSectionForm>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="general-settings-form"
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
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="siteIds"
                                    render={(field) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>{t("sites")}</FormLabel>
                                            <TagInput
                                                {...field}
                                                activeTagIndex={activeSitesTagIndex}
                                                setActiveTagIndex={setActiveSitesTagIndex}
                                                placeholder={t("selectSites")}
                                                size="sm"
                                                tags={form.getValues().siteIds}
                                                setTags={(newTags) => {
                                                    form.setValue(
                                                        "siteIds",
                                                        newTags as [Tag, ...Tag[]]
                                                    );
                                                }}
                                                enableAutocomplete={true}
                                                autocompleteOptions={sites}
                                                allowDuplicates={false}
                                                restrictTagsToAutocompleteOptions={true}
                                                sortTags={true}
                                            />
                                            <FormDescription>
                                                {t("sitesDescription")}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </SettingsSectionForm>
                </SettingsSectionBody>

                <SettingsSectionFooter>
                    <Button
                        type="submit"
                        form="general-settings-form"
                        loading={loading}
                        disabled={loading}
                    >
                        {t("saveSettings")}
                    </Button>
                </SettingsSectionFooter>
            </SettingsSection>
        </SettingsContainer>
    );
}