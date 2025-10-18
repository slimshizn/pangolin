"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import { useForm } from "react-hook-form";
import { toast } from "@app/hooks/useToast";
import { useRouter, useParams, redirect } from "next/navigation";
import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionHeader,
    SettingsSectionTitle,
    SettingsSectionDescription,
    SettingsSectionBody,
    SettingsSectionForm,
    SettingsSectionFooter,
    SettingsSectionGrid
} from "@app/components/Settings";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useState, useEffect } from "react";
import { SwitchInput } from "@app/components/SwitchInput";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { InfoIcon, ExternalLink } from "lucide-react";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import CopyToClipboard from "@app/components/CopyToClipboard";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import IdpTypeBadge from "@app/components/IdpTypeBadge";
import { useTranslations } from "next-intl";
import { AxiosResponse } from "axios";
import { ListRolesResponse } from "@server/routers/role";
import AutoProvisionConfigWidget from "@app/components/private/AutoProvisionConfigWidget";

export default function GeneralPage() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const router = useRouter();
    const { idpId, orgId } = useParams();
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [roles, setRoles] = useState<{ roleId: number; name: string }[]>([]);
    const [roleMappingMode, setRoleMappingMode] = useState<
        "role" | "expression"
    >("role");
    const [variant, setVariant] = useState<"oidc" | "google" | "azure">("oidc");
    const { isUnlocked } = useLicenseStatusContext();

    const [redirectUrl, setRedirectUrl] = useState(
        `${env.app.dashboardUrl}/auth/idp/${idpId}/oidc/callback`
    );
    const t = useTranslations();

    // OIDC form schema (full configuration)
    const OidcFormSchema = z.object({
        name: z.string().min(2, { message: t("nameMin", { len: 2 }) }),
        clientId: z.string().min(1, { message: t("idpClientIdRequired") }),
        clientSecret: z
            .string()
            .min(1, { message: t("idpClientSecretRequired") }),
        roleMapping: z.string().nullable().optional(),
        roleId: z.number().nullable().optional(),
        authUrl: z.string().url({ message: t("idpErrorAuthUrlInvalid") }),
        tokenUrl: z.string().url({ message: t("idpErrorTokenUrlInvalid") }),
        identifierPath: z.string().min(1, { message: t("idpPathRequired") }),
        emailPath: z.string().nullable().optional(),
        namePath: z.string().nullable().optional(),
        scopes: z.string().min(1, { message: t("idpScopeRequired") }),
        autoProvision: z.boolean().default(false)
    });

    // Google form schema (simplified)
    const GoogleFormSchema = z.object({
        name: z.string().min(2, { message: t("nameMin", { len: 2 }) }),
        clientId: z.string().min(1, { message: t("idpClientIdRequired") }),
        clientSecret: z
            .string()
            .min(1, { message: t("idpClientSecretRequired") }),
        roleMapping: z.string().nullable().optional(),
        roleId: z.number().nullable().optional(),
        autoProvision: z.boolean().default(false)
    });

    // Azure form schema (simplified with tenant ID)
    const AzureFormSchema = z.object({
        name: z.string().min(2, { message: t("nameMin", { len: 2 }) }),
        clientId: z.string().min(1, { message: t("idpClientIdRequired") }),
        clientSecret: z
            .string()
            .min(1, { message: t("idpClientSecretRequired") }),
        tenantId: z.string().min(1, { message: t("idpTenantIdRequired") }),
        roleMapping: z.string().nullable().optional(),
        roleId: z.number().nullable().optional(),
        autoProvision: z.boolean().default(false)
    });

    type OidcFormValues = z.infer<typeof OidcFormSchema>;
    type GoogleFormValues = z.infer<typeof GoogleFormSchema>;
    type AzureFormValues = z.infer<typeof AzureFormSchema>;
    type GeneralFormValues =
        | OidcFormValues
        | GoogleFormValues
        | AzureFormValues;

    // Get the appropriate schema based on variant
    const getFormSchema = () => {
        switch (variant) {
            case "google":
                return GoogleFormSchema;
            case "azure":
                return AzureFormSchema;
            default:
                return OidcFormSchema;
        }
    };

    const form = useForm<GeneralFormValues>({
        resolver: zodResolver(getFormSchema()) as any, // is this right?
        defaultValues: {
            name: "",
            clientId: "",
            clientSecret: "",
            authUrl: "",
            tokenUrl: "",
            identifierPath: "sub",
            emailPath: "email",
            namePath: "name",
            scopes: "openid profile email",
            autoProvision: true,
            roleMapping: null,
            roleId: null,
            tenantId: ""
        }
    });

    // Update form resolver when variant changes
    useEffect(() => {
        form.clearErrors();
        // Note: We can't change the resolver dynamically, so we'll handle validation in onSubmit
    }, [variant]);

    useEffect(() => {
        async function fetchRoles() {
            const res = await api
                .get<AxiosResponse<ListRolesResponse>>(`/org/${orgId}/roles`)
                .catch((e) => {
                    console.error(e);
                    toast({
                        variant: "destructive",
                        title: t("accessRoleErrorFetch"),
                        description: formatAxiosError(
                            e,
                            t("accessRoleErrorFetchDescription")
                        )
                    });
                });

            if (res?.status === 200) {
                setRoles(res.data.data.roles);
            }
        }

        const loadIdp = async (
            availableRoles: { roleId: number; name: string }[]
        ) => {
            try {
                const res = await api.get(`/org/${orgId}/idp/${idpId}`);
                if (res.status === 200) {
                    const data = res.data.data;
                    const roleMapping = data.idpOrg.roleMapping;
                    const idpVariant = data.idpOidcConfig?.variant || "oidc";
                    setRedirectUrl(res.data.data.redirectUrl);

                    // Set the variant
                    setVariant(idpVariant as "oidc" | "google" | "azure");

                    // Check if roleMapping matches the basic pattern '{role name}' (simple single role)
                    // This should NOT match complex expressions like 'Admin' || 'Member'
                    const isBasicRolePattern =
                        roleMapping &&
                        typeof roleMapping === "string" &&
                        /^'[^']+'$/.test(roleMapping);

                    // Determine if roleMapping is a number (roleId) or matches basic pattern
                    const isRoleId =
                        !isNaN(Number(roleMapping)) && roleMapping !== "";
                    const isRoleName = isBasicRolePattern;

                    // Extract role name from basic pattern for matching
                    let extractedRoleName = null;
                    if (isRoleName) {
                        extractedRoleName = roleMapping.slice(1, -1); // Remove quotes
                    }

                    // Try to find matching role by name if we have a basic pattern
                    let matchingRoleId = undefined;
                    if (extractedRoleName && availableRoles.length > 0) {
                        const matchingRole = availableRoles.find(
                            (role) => role.name === extractedRoleName
                        );
                        if (matchingRole) {
                            matchingRoleId = matchingRole.roleId;
                        }
                    }

                    // Extract tenant ID from Azure URLs if present
                    let tenantId = "";
                    if (idpVariant === "azure" && data.idpOidcConfig?.authUrl) {
                        // Azure URL format: https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/authorize
                        const tenantMatch = data.idpOidcConfig.authUrl.match(
                            /login\.microsoftonline\.com\/([^\/]+)\/oauth2/
                        );
                        if (tenantMatch) {
                            tenantId = tenantMatch[1];
                        }
                    }

                    // Reset form with appropriate data based on variant
                    const formData: any = {
                        name: data.idp.name,
                        clientId: data.idpOidcConfig.clientId,
                        clientSecret: data.idpOidcConfig.clientSecret,
                        autoProvision: data.idp.autoProvision,
                        roleMapping: roleMapping || null,
                        roleId: isRoleId
                            ? Number(roleMapping)
                            : matchingRoleId || null
                    };

                    // Add variant-specific fields
                    if (idpVariant === "oidc") {
                        formData.authUrl = data.idpOidcConfig.authUrl;
                        formData.tokenUrl = data.idpOidcConfig.tokenUrl;
                        formData.identifierPath =
                            data.idpOidcConfig.identifierPath;
                        formData.emailPath =
                            data.idpOidcConfig.emailPath || null;
                        formData.namePath = data.idpOidcConfig.namePath || null;
                        formData.scopes = data.idpOidcConfig.scopes;
                    } else if (idpVariant === "azure") {
                        formData.tenantId = tenantId;
                    }

                    form.reset(formData);

                    // Set the role mapping mode based on the data
                    // Default to "expression" unless it's a simple roleId or basic '{role name}' pattern
                    setRoleMappingMode(
                        matchingRoleId && isRoleName ? "role" : "expression"
                    );
                }
            } catch (e) {
                toast({
                    title: t("error"),
                    description: formatAxiosError(e),
                    variant: "destructive"
                });
                router.push(`/${orgId}/settings/idp`);
            } finally {
                setInitialLoading(false);
            }
        };

        const loadData = async () => {
            const rolesRes = await api
                .get<AxiosResponse<ListRolesResponse>>(`/org/${orgId}/roles`)
                .catch((e) => {
                    console.error(e);
                    toast({
                        variant: "destructive",
                        title: t("accessRoleErrorFetch"),
                        description: formatAxiosError(
                            e,
                            t("accessRoleErrorFetchDescription")
                        )
                    });
                    return null;
                });

            const availableRoles =
                rolesRes?.status === 200 ? rolesRes.data.data.roles : [];
            setRoles(availableRoles);

            await loadIdp(availableRoles);
        };

        loadData();
    }, []);

    async function onSubmit(data: GeneralFormValues) {
        setLoading(true);

        try {
            // Validate against the correct schema based on variant
            const schema = getFormSchema();
            const validationResult = schema.safeParse(data);

            if (!validationResult.success) {
                // Set form errors
                const errors = validationResult.error.flatten().fieldErrors;
                Object.keys(errors).forEach((key) => {
                    const fieldName = key as keyof GeneralFormValues;
                    const errorMessage =
                        (errors as any)[key]?.[0] || t("invalidValue");
                    form.setError(fieldName, {
                        type: "manual",
                        message: errorMessage
                    });
                });
                setLoading(false);
                return;
            }

            const roleName = roles.find((r) => r.roleId === data.roleId)?.name;

            // Build payload based on variant
            let payload: any = {
                name: data.name,
                clientId: data.clientId,
                clientSecret: data.clientSecret,
                autoProvision: data.autoProvision,
                roleMapping:
                    roleMappingMode === "role"
                        ? `'${roleName}'`
                        : data.roleMapping || ""
            };

            // Add variant-specific fields
            if (variant === "oidc") {
                const oidcData = data as OidcFormValues;
                payload = {
                    ...payload,
                    authUrl: oidcData.authUrl,
                    tokenUrl: oidcData.tokenUrl,
                    identifierPath: oidcData.identifierPath,
                    emailPath: oidcData.emailPath || "",
                    namePath: oidcData.namePath || "",
                    scopes: oidcData.scopes
                };
            } else if (variant === "azure") {
                const azureData = data as AzureFormValues;
                // Construct URLs dynamically for Azure provider
                const authUrl = `https://login.microsoftonline.com/${azureData.tenantId}/oauth2/v2.0/authorize`;
                const tokenUrl = `https://login.microsoftonline.com/${azureData.tenantId}/oauth2/v2.0/token`;
                payload = {
                    ...payload,
                    authUrl: authUrl,
                    tokenUrl: tokenUrl,
                    identifierPath: "email",
                    emailPath: "email",
                    namePath: "name",
                    scopes: "openid profile email"
                };
            } else if (variant === "google") {
                // Google uses predefined URLs
                payload = {
                    ...payload,
                    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
                    tokenUrl: "https://oauth2.googleapis.com/token",
                    identifierPath: "email",
                    emailPath: "email",
                    namePath: "name",
                    scopes: "openid profile email"
                };
            }

            const res = await api.post(
                `/org/${orgId}/idp/${idpId}/oidc`,
                payload
            );

            if (res.status === 200) {
                toast({
                    title: t("success"),
                    description: t("idpUpdatedDescription")
                });
                router.refresh();
            }
        } catch (e) {
            toast({
                title: t("error"),
                description: formatAxiosError(e),
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    }

    if (initialLoading) {
        return null;
    }

    return (
        <>
            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("idpTitle")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("idpSettingsDescription")}
                        </SettingsSectionDescription>
                    </SettingsSectionHeader>
                    <SettingsSectionBody>
                        <InfoSections cols={3}>
                            <InfoSection>
                                <InfoSectionTitle>
                                    {t("redirectUrl")}
                                </InfoSectionTitle>
                                <InfoSectionContent>
                                    <CopyToClipboard text={redirectUrl} />
                                </InfoSectionContent>
                            </InfoSection>
                        </InfoSections>

                        <Alert variant="neutral" className="">
                            <InfoIcon className="h-4 w-4" />
                            <AlertTitle className="font-semibold">
                                {t("redirectUrlAbout")}
                            </AlertTitle>
                            <AlertDescription>
                                {t("redirectUrlAboutDescription")}
                            </AlertDescription>
                        </Alert>

                        {/* IDP Type Indicator */}
                        <div className="flex items-center space-x-2 mb-4">
                            <span className="text-sm font-medium text-muted-foreground">
                                {t("idpTypeLabel")}:
                            </span>
                            <IdpTypeBadge type={variant} />
                        </div>
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
                                                <FormLabel>
                                                    {t("name")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input {...field} />
                                                </FormControl>
                                                <FormDescription>
                                                    {t("idpDisplayName")}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        </SettingsSectionForm>
                    </SettingsSectionBody>
                </SettingsSection>

                {/* Auto Provision Settings */}
                <SettingsSection>
                    <SettingsSectionHeader>
                        <SettingsSectionTitle>
                            {t("idpAutoProvisionUsers")}
                        </SettingsSectionTitle>
                        <SettingsSectionDescription>
                            {t("idpAutoProvisionUsersDescription")}
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
                                    <AutoProvisionConfigWidget
                                        control={form.control}
                                        autoProvision={form.watch(
                                            "autoProvision"
                                        )}
                                        onAutoProvisionChange={(checked) => {
                                            form.setValue(
                                                "autoProvision",
                                                checked
                                            );
                                        }}
                                        roleMappingMode={roleMappingMode}
                                        onRoleMappingModeChange={(data) => {
                                            setRoleMappingMode(data);
                                            // Clear roleId and roleMapping when mode changes
                                            form.setValue("roleId", null);
                                            form.setValue("roleMapping", null);
                                        }}
                                        roles={roles}
                                        roleIdFieldName="roleId"
                                        roleMappingFieldName="roleMapping"
                                    />
                                </form>
                            </Form>
                        </SettingsSectionForm>
                    </SettingsSectionBody>
                </SettingsSection>

                {/* Google Configuration */}
                {variant === "google" && (
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("idpGoogleConfiguration")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("idpGoogleConfigurationDescription")}
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
                                            name="clientId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("idpClientId")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input {...field} />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "idpGoogleClientIdDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="clientSecret"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("idpClientSecret")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="password"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "idpGoogleClientSecretDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </form>
                                </Form>
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                    </SettingsSection>
                )}

                {/* Azure Configuration */}
                {variant === "azure" && (
                    <SettingsSection>
                        <SettingsSectionHeader>
                            <SettingsSectionTitle>
                                {t("idpAzureConfiguration")}
                            </SettingsSectionTitle>
                            <SettingsSectionDescription>
                                {t("idpAzureConfigurationDescription")}
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
                                            name="tenantId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("idpTenantId")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input {...field} />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "idpAzureTenantIdDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="clientId"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("idpClientId")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input {...field} />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "idpAzureClientIdDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="clientSecret"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {t("idpClientSecret")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="password"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormDescription>
                                                        {t(
                                                            "idpAzureClientSecretDescription"
                                                        )}
                                                    </FormDescription>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </form>
                                </Form>
                            </SettingsSectionForm>
                        </SettingsSectionBody>
                    </SettingsSection>
                )}

                {/* OIDC Configuration */}
                {variant === "oidc" && (
                    <SettingsSectionGrid cols={2}>
                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    {t("idpOidcConfigure")}
                                </SettingsSectionTitle>
                                <SettingsSectionDescription>
                                    {t("idpOidcConfigureDescription")}
                                </SettingsSectionDescription>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <SettingsSectionForm>
                                    <Form {...form}>
                                        <form
                                            onSubmit={form.handleSubmit(
                                                onSubmit
                                            )}
                                            className="space-y-4"
                                            id="general-settings-form"
                                        >
                                            <FormField
                                                control={form.control}
                                                name="clientId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("idpClientId")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpClientIdDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="clientSecret"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "idpClientSecret"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="password"
                                                                {...field}
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpClientSecretDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="authUrl"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("idpAuthUrl")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpAuthUrlDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="tokenUrl"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("idpTokenUrl")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpTokenUrlDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </form>
                                    </Form>
                                </SettingsSectionForm>
                            </SettingsSectionBody>
                        </SettingsSection>

                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    {t("idpToken")}
                                </SettingsSectionTitle>
                                <SettingsSectionDescription>
                                    {t("idpTokenDescription")}
                                </SettingsSectionDescription>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <SettingsSectionForm>
                                    <Form {...form}>
                                        <form
                                            onSubmit={form.handleSubmit(
                                                onSubmit
                                            )}
                                            className="space-y-4"
                                            id="general-settings-form"
                                        >
                                            <Alert variant="neutral">
                                                <InfoIcon className="h-4 w-4" />
                                                <AlertTitle className="font-semibold">
                                                    {t("idpJmespathAbout")}
                                                </AlertTitle>
                                                <AlertDescription>
                                                    {t(
                                                        "idpJmespathAboutDescription"
                                                    )}{" "}
                                                    <a
                                                        href="https://jmespath.org"
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-primary hover:underline inline-flex items-center"
                                                    >
                                                        {t(
                                                            "idpJmespathAboutDescriptionLink"
                                                        )}{" "}
                                                        <ExternalLink className="ml-1 h-4 w-4" />
                                                    </a>
                                                </AlertDescription>
                                            </Alert>

                                            <FormField
                                                control={form.control}
                                                name="identifierPath"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "idpJmespathLabel"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpJmespathLabelDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="emailPath"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "idpJmespathEmailPathOptional"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                value={
                                                                    field.value ||
                                                                    ""
                                                                }
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpJmespathEmailPathOptionalDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="namePath"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "idpJmespathNamePathOptional"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                {...field}
                                                                value={
                                                                    field.value ||
                                                                    ""
                                                                }
                                                            />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpJmespathNamePathOptionalDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="scopes"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t(
                                                                "idpOidcConfigureScopes"
                                                            )}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                        <FormDescription>
                                                            {t(
                                                                "idpOidcConfigureScopesDescription"
                                                            )}
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </form>
                                    </Form>
                                </SettingsSectionForm>
                            </SettingsSectionBody>
                        </SettingsSection>
                    </SettingsSectionGrid>
                )}
            </SettingsContainer>

            <div className="flex justify-end mt-8">
                <Button
                    type="button"
                    form="general-settings-form"
                    loading={loading}
                    disabled={loading}
                    onClick={() => {
                        form.handleSubmit(onSubmit)();
                    }}
                >
                    {t("saveGeneralSettings")}
                </Button>
            </div>
        </>
    );
}
