"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { StrategyOption, StrategySelect } from "@app/components/StrategySelect";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { Button } from "@app/components/ui/button";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { toast } from "@app/hooks/useToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { InviteUserBody, InviteUserResponse } from "@server/routers/user";
import { AxiosResponse } from "axios";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import CopyTextBox from "@app/components/CopyTextBox";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { ListRolesResponse } from "@server/routers/role";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { Checkbox } from "@app/components/ui/checkbox";
import { ListIdpsResponse } from "@server/routers/idp";
import { useTranslations } from "next-intl";
import { build } from "@server/build";
import Image from "next/image";
import { useSubscriptionStatusContext } from "@app/hooks/useSubscriptionStatusContext";
import { TierId } from "@server/lib/billing/tiers";

type UserType = "internal" | "oidc";

interface IdpOption {
    idpId: number;
    name: string;
    type: string;
    variant: string | null;
}

interface UserOption {
    id: string;
    title: string;
    description: string;
    disabled: boolean;
    icon?: React.ReactNode;
    idpId?: number;
    variant?: string | null;
}

export default function Page() {
    const { orgId } = useParams();
    const router = useRouter();
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const t = useTranslations();

    const subscription = useSubscriptionStatusContext();

    const [selectedOption, setSelectedOption] = useState<string | null>(
        "internal"
    );
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [expiresInDays, setExpiresInDays] = useState(1);
    const [roles, setRoles] = useState<{ roleId: number; name: string }[]>([]);
    const [idps, setIdps] = useState<IdpOption[]>([]);
    const [sendEmail, setSendEmail] = useState(env.email.emailEnabled);
    const [userOptions, setUserOptions] = useState<UserOption[]>([]);
    const [dataLoaded, setDataLoaded] = useState(false);

    const internalFormSchema = z.object({
        email: z.string().email({ message: t("emailInvalid") }),
        validForHours: z
            .string()
            .min(1, { message: t("inviteValidityDuration") }),
        roleId: z.string().min(1, { message: t("accessRoleSelectPlease") })
    });

    const googleAzureFormSchema = z.object({
        email: z.string().email({ message: t("emailInvalid") }),
        name: z.string().optional(),
        roleId: z.string().min(1, { message: t("accessRoleSelectPlease") })
    });

    const genericOidcFormSchema = z.object({
        username: z.string().min(1, { message: t("usernameRequired") }),
        email: z
            .string()
            .email({ message: t("emailInvalid") })
            .optional()
            .or(z.literal("")),
        name: z.string().optional(),
        roleId: z.string().min(1, { message: t("accessRoleSelectPlease") })
    });

    const formatIdpType = (type: string) => {
        switch (type.toLowerCase()) {
            case "oidc":
                return t("idpGenericOidc");
            case "google":
                return t("idpGoogleDescription");
            case "azure":
                return t("idpAzureDescription");
            default:
                return type;
        }
    };

    const getIdpIcon = (variant: string | null) => {
        if (!variant) return null;

        switch (variant.toLowerCase()) {
            case "google":
                return (
                    <Image
                        src="/idp/google.png"
                        alt={t("idpGoogleAlt")}
                        width={24}
                        height={24}
                        className="rounded"
                    />
                );
            case "azure":
                return (
                    <Image
                        src="/idp/azure.png"
                        alt={t("idpAzureAlt")}
                        width={24}
                        height={24}
                        className="rounded"
                    />
                );
            default:
                return null;
        }
    };

    const validFor = [
        { hours: 24, name: t("day", { count: 1 }) },
        { hours: 48, name: t("day", { count: 2 }) },
        { hours: 72, name: t("day", { count: 3 }) },
        { hours: 96, name: t("day", { count: 4 }) },
        { hours: 120, name: t("day", { count: 5 }) },
        { hours: 144, name: t("day", { count: 6 }) },
        { hours: 168, name: t("day", { count: 7 }) }
    ];

    const internalForm = useForm({
        resolver: zodResolver(internalFormSchema),
        defaultValues: {
            email: "",
            validForHours: "72",
            roleId: ""
        }
    });

    const googleAzureForm = useForm({
        resolver: zodResolver(googleAzureFormSchema),
        defaultValues: {
            email: "",
            name: "",
            roleId: ""
        }
    });

    const genericOidcForm = useForm({
        resolver: zodResolver(genericOidcFormSchema),
        defaultValues: {
            username: "",
            email: "",
            name: "",
            roleId: ""
        }
    });

    useEffect(() => {
        if (selectedOption === "internal") {
            setSendEmail(env.email.emailEnabled);
            internalForm.reset();
            setInviteLink(null);
            setExpiresInDays(1);
        } else if (selectedOption && selectedOption !== "internal") {
            googleAzureForm.reset();
            genericOidcForm.reset();
        }
    }, [
        selectedOption,
        env.email.emailEnabled,
        internalForm,
        googleAzureForm,
        genericOidcForm
    ]);

    useEffect(() => {
        if (!selectedOption) {
            return;
        }

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

        async function fetchIdps() {
            if (build === "saas" && !subscription?.subscribed) {
                return;
            }

            const res = await api
                .get<
                    AxiosResponse<ListIdpsResponse>
                >(build === "saas" ? `/org/${orgId}/idp` : "/idp")
                .catch((e) => {
                    console.error(e);
                    toast({
                        variant: "destructive",
                        title: t("idpErrorFetch"),
                        description: formatAxiosError(
                            e,
                            t("idpErrorFetchDescription")
                        )
                    });
                });

            if (res?.status === 200) {
                setIdps(res.data.data.idps);
            }
        }

        async function fetchInitialData() {
            setDataLoaded(false);
            await fetchRoles();
            await fetchIdps();
            setDataLoaded(true);
        }

        fetchInitialData();
    }, []);

    // Build user options when IDPs are loaded
    useEffect(() => {
        const options: UserOption[] = [
            {
                id: "internal",
                title: t("userTypeInternal"),
                description: t("userTypeInternalDescription"),
                disabled: false
            }
        ];

        // Add IDP options
        idps.forEach((idp) => {
            options.push({
                id: `idp-${idp.idpId}`,
                title: idp.name,
                description: formatIdpType(idp.variant || idp.type),
                disabled: false,
                icon: getIdpIcon(idp.variant),
                idpId: idp.idpId,
                variant: idp.variant
            });
        });

        setUserOptions(options);
    }, [idps, t]);

    async function onSubmitInternal(
        values: z.infer<typeof internalFormSchema>
    ) {
        setLoading(true);

        const res = await api
            .post<AxiosResponse<InviteUserResponse>>(
                `/org/${orgId}/create-invite`,
                {
                    email: values.email,
                    roleId: parseInt(values.roleId),
                    validHours: parseInt(values.validForHours),
                    sendEmail: sendEmail
                } as InviteUserBody
            )
            .catch((e) => {
                if (e.response?.status === 409) {
                    toast({
                        variant: "destructive",
                        title: t("userErrorExists"),
                        description: t("userErrorExistsDescription")
                    });
                } else {
                    toast({
                        variant: "destructive",
                        title: t("inviteError"),
                        description: formatAxiosError(
                            e,
                            t("inviteErrorDescription")
                        )
                    });
                }
            });

        if (res && res.status === 200) {
            setInviteLink(res.data.data.inviteLink);
            toast({
                variant: "default",
                title: t("userInvited"),
                description: t("userInvitedDescription")
            });

            setExpiresInDays(parseInt(values.validForHours) / 24);
        }

        setLoading(false);
    }

    async function onSubmitGoogleAzure(
        values: z.infer<typeof googleAzureFormSchema>
    ) {
        const selectedUserOption = userOptions.find(
            (opt) => opt.id === selectedOption
        );
        if (!selectedUserOption?.idpId) return;

        setLoading(true);

        const res = await api
            .put(`/org/${orgId}/user`, {
                username: values.email, // Use email as username for Google/Azure
                email: values.email,
                name: values.name,
                type: "oidc",
                idpId: selectedUserOption.idpId,
                roleId: parseInt(values.roleId)
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("userErrorCreate"),
                    description: formatAxiosError(
                        e,
                        t("userErrorCreateDescription")
                    )
                });
            });

        if (res && res.status === 201) {
            toast({
                variant: "default",
                title: t("userCreated"),
                description: t("userCreatedDescription")
            });
            router.push(`/${orgId}/settings/access/users`);
        }

        setLoading(false);
    }

    async function onSubmitGenericOidc(
        values: z.infer<typeof genericOidcFormSchema>
    ) {
        const selectedUserOption = userOptions.find(
            (opt) => opt.id === selectedOption
        );
        if (!selectedUserOption?.idpId) return;

        setLoading(true);

        const res = await api
            .put(`/org/${orgId}/user`, {
                username: values.username,
                email: values.email,
                name: values.name,
                type: "oidc",
                idpId: selectedUserOption.idpId,
                roleId: parseInt(values.roleId)
            })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t("userErrorCreate"),
                    description: formatAxiosError(
                        e,
                        t("userErrorCreateDescription")
                    )
                });
            });

        if (res && res.status === 201) {
            toast({
                variant: "default",
                title: t("userCreated"),
                description: t("userCreatedDescription")
            });
            router.push(`/${orgId}/settings/access/users`);
        }

        setLoading(false);
    }

    return (
        <>
            <div className="flex justify-between">
                <HeaderTitle
                    title={t("accessUserCreate")}
                    description={t("accessUserCreateDescription")}
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        router.push(`/${orgId}/settings/access/users`);
                    }}
                >
                    {t("userSeeAll")}
                </Button>
            </div>

            <div>
                <SettingsContainer>
                    {!inviteLink ? (
                        <SettingsSection>
                            <SettingsSectionHeader>
                                <SettingsSectionTitle>
                                    {t("userTypeTitle")}
                                </SettingsSectionTitle>
                                <SettingsSectionDescription>
                                    {t("userTypeDescription")}
                                </SettingsSectionDescription>
                            </SettingsSectionHeader>
                            <SettingsSectionBody>
                                <StrategySelect
                                    options={userOptions}
                                    defaultValue={selectedOption || undefined}
                                    onChange={(value) => {
                                        setSelectedOption(value);
                                        if (value === "internal") {
                                            internalForm.reset();
                                        } else {
                                            googleAzureForm.reset();
                                            genericOidcForm.reset();
                                        }
                                    }}
                                    cols={2}
                                />
                            </SettingsSectionBody>
                        </SettingsSection>
                    ) : null}

                    {selectedOption === "internal" && dataLoaded && (
                        <>
                            {!inviteLink ? (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("userSettings")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("userSettingsDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <SettingsSectionForm>
                                            <Form {...internalForm}>
                                                <form
                                                    onSubmit={internalForm.handleSubmit(
                                                        onSubmitInternal
                                                    )}
                                                    className="space-y-4"
                                                    id="create-user-form"
                                                >
                                                    <FormField
                                                        control={
                                                            internalForm.control
                                                        }
                                                        name="email"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t("email")}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            internalForm.control
                                                        }
                                                        name="validForHours"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "inviteValid"
                                                                    )}
                                                                </FormLabel>
                                                                <Select
                                                                    onValueChange={
                                                                        field.onChange
                                                                    }
                                                                    defaultValue={
                                                                        field.value
                                                                    }
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue
                                                                                placeholder={t(
                                                                                    "selectDuration"
                                                                                )}
                                                                            />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {validFor.map(
                                                                            (
                                                                                option
                                                                            ) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        option.hours
                                                                                    }
                                                                                    value={option.hours.toString()}
                                                                                >
                                                                                    {
                                                                                        option.name
                                                                                    }
                                                                                </SelectItem>
                                                                            )
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            internalForm.control
                                                        }
                                                        name="roleId"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t("role")}
                                                                </FormLabel>
                                                                <Select
                                                                    onValueChange={
                                                                        field.onChange
                                                                    }
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue
                                                                                placeholder={t(
                                                                                    "accessRoleSelect"
                                                                                )}
                                                                            />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {roles.map(
                                                                            (
                                                                                role
                                                                            ) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        role.roleId
                                                                                    }
                                                                                    value={role.roleId.toString()}
                                                                                >
                                                                                    {
                                                                                        role.name
                                                                                    }
                                                                                </SelectItem>
                                                                            )
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    {env.email.emailEnabled && (
                                                        <div className="flex items-center space-x-2">
                                                            <Checkbox
                                                                id="send-email"
                                                                checked={
                                                                    sendEmail
                                                                }
                                                                onCheckedChange={(
                                                                    e
                                                                ) =>
                                                                    setSendEmail(
                                                                        e as boolean
                                                                    )
                                                                }
                                                            />
                                                            <label
                                                                htmlFor="send-email"
                                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                                            >
                                                                {t(
                                                                    "inviteEmailSent"
                                                                )}
                                                            </label>
                                                        </div>
                                                    )}
                                                </form>
                                            </Form>
                                        </SettingsSectionForm>
                                    </SettingsSectionBody>
                                </SettingsSection>
                            ) : (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("userInvited")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {sendEmail
                                                ? t(
                                                      "inviteEmailSentDescription"
                                                  )
                                                : t("inviteSentDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <div className="space-y-4">
                                            <p>
                                                {t("inviteExpiresIn", {
                                                    days: expiresInDays
                                                })}
                                            </p>
                                            <CopyTextBox
                                                text={inviteLink}
                                                wrapText={false}
                                            />
                                        </div>
                                    </SettingsSectionBody>
                                </SettingsSection>
                            )}
                        </>
                    )}

                    {selectedOption &&
                        selectedOption !== "internal" &&
                        dataLoaded && (
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("userSettings")}
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        {t("userSettingsDescription")}
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <SettingsSectionForm>
                                        {/* Google/Azure Form */}
                                        {(() => {
                                            const selectedUserOption =
                                                userOptions.find(
                                                    (opt) =>
                                                        opt.id ===
                                                        selectedOption
                                                );
                                            return (
                                                selectedUserOption?.variant ===
                                                    "google" ||
                                                selectedUserOption?.variant ===
                                                    "azure"
                                            );
                                        })() && (
                                            <Form {...googleAzureForm}>
                                                <form
                                                    onSubmit={googleAzureForm.handleSubmit(
                                                        onSubmitGoogleAzure
                                                    )}
                                                    className="space-y-4"
                                                    id="create-user-form"
                                                >
                                                    <FormField
                                                        control={
                                                            googleAzureForm.control
                                                        }
                                                        name="email"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t("email")}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            googleAzureForm.control
                                                        }
                                                        name="name"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "nameOptional"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            googleAzureForm.control
                                                        }
                                                        name="roleId"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t("role")}
                                                                </FormLabel>
                                                                <Select
                                                                    onValueChange={
                                                                        field.onChange
                                                                    }
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue
                                                                                placeholder={t(
                                                                                    "accessRoleSelect"
                                                                                )}
                                                                            />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {roles.map(
                                                                            (
                                                                                role
                                                                            ) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        role.roleId
                                                                                    }
                                                                                    value={role.roleId.toString()}
                                                                                >
                                                                                    {
                                                                                        role.name
                                                                                    }
                                                                                </SelectItem>
                                                                            )
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </form>
                                            </Form>
                                        )}

                                        {/* Generic OIDC Form */}
                                        {(() => {
                                            const selectedUserOption =
                                                userOptions.find(
                                                    (opt) =>
                                                        opt.id ===
                                                        selectedOption
                                                );
                                            return (
                                                selectedUserOption?.variant !==
                                                    "google" &&
                                                selectedUserOption?.variant !==
                                                    "azure"
                                            );
                                        })() && (
                                            <Form {...genericOidcForm}>
                                                <form
                                                    onSubmit={genericOidcForm.handleSubmit(
                                                        onSubmitGenericOidc
                                                    )}
                                                    className="space-y-4"
                                                    id="create-user-form"
                                                >
                                                    <FormField
                                                        control={
                                                            genericOidcForm.control
                                                        }
                                                        name="username"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "username"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <p className="text-sm text-muted-foreground mt-1">
                                                                    {t(
                                                                        "usernameUniq"
                                                                    )}
                                                                </p>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            genericOidcForm.control
                                                        }
                                                        name="email"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "emailOptional"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            genericOidcForm.control
                                                        }
                                                        name="name"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "nameOptional"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        {...field}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            genericOidcForm.control
                                                        }
                                                        name="roleId"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t("role")}
                                                                </FormLabel>
                                                                <Select
                                                                    onValueChange={
                                                                        field.onChange
                                                                    }
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger className="w-full">
                                                                            <SelectValue
                                                                                placeholder={t(
                                                                                    "accessRoleSelect"
                                                                                )}
                                                                            />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        {roles.map(
                                                                            (
                                                                                role
                                                                            ) => (
                                                                                <SelectItem
                                                                                    key={
                                                                                        role.roleId
                                                                                    }
                                                                                    value={role.roleId.toString()}
                                                                                >
                                                                                    {
                                                                                        role.name
                                                                                    }
                                                                                </SelectItem>
                                                                            )
                                                                        )}
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                </form>
                                            </Form>
                                        )}
                                    </SettingsSectionForm>
                                </SettingsSectionBody>
                            </SettingsSection>
                        )}
                </SettingsContainer>

                <div className="flex justify-end space-x-2 mt-8">
                    {selectedOption && dataLoaded && (
                        <Button
                            type={inviteLink ? "button" : "submit"}
                            form={inviteLink ? undefined : "create-user-form"}
                            loading={loading}
                            disabled={loading}
                            onClick={
                                inviteLink
                                    ? () =>
                                          router.push(
                                              `/${orgId}/settings/access/users`
                                          )
                                    : undefined
                            }
                        >
                            {inviteLink ? t("done") : t("accessUserCreate")}
                        </Button>
                    )}
                </div>
            </div>
        </>
    );
}
