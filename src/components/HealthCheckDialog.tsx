"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { HeadersInput } from "@app/components/HeadersInput";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@/components/Credenza";
import { toast } from "@/hooks/useToast";
import { useTranslations } from "next-intl";

type HealthCheckConfig = {
    hcEnabled: boolean;
    hcPath: string;
    hcMethod: string;
    hcInterval: number;
    hcTimeout: number;
    hcStatus: number | null;
    hcHeaders?: { name: string; value: string }[] | null;
    hcScheme?: string;
    hcHostname: string;
    hcPort: number;
    hcFollowRedirects: boolean;
    hcMode: string;
    hcUnhealthyInterval: number;
};

type HealthCheckDialogProps = {
    open: boolean;
    setOpen: (val: boolean) => void;
    targetId: number;
    targetAddress: string;
    targetMethod?: string;
    initialConfig?: Partial<HealthCheckConfig>;
    onChanges: (config: HealthCheckConfig) => Promise<void>;
};

export default function HealthCheckDialog({
    open,
    setOpen,
    targetId,
    targetAddress,
    targetMethod,
    initialConfig,
    onChanges
}: HealthCheckDialogProps) {
    const t = useTranslations();

    const healthCheckSchema = z.object({
        hcEnabled: z.boolean(),
        hcPath: z.string().min(1, { message: t("healthCheckPathRequired") }),
        hcMethod: z
            .string()
            .min(1, { message: t("healthCheckMethodRequired") }),
        hcInterval: z
            .number()
            .int()
            .positive()
            .min(5, { message: t("healthCheckIntervalMin") }),
        hcTimeout: z
            .number()
            .int()
            .positive()
            .min(1, { message: t("healthCheckTimeoutMin") }),
        hcStatus: z.number().int().positive().min(100).optional().nullable(),
        hcHeaders: z.array(z.object({ name: z.string(), value: z.string() })).nullable().optional(),
        hcScheme: z.string().optional(),
        hcHostname: z.string(),
        hcPort: z.number().positive().gt(0).lte(65535),
        hcFollowRedirects: z.boolean(),
        hcMode: z.string(),
        hcUnhealthyInterval: z.number().int().positive().min(5)
    });

    const form = useForm<z.infer<typeof healthCheckSchema>>({
        resolver: zodResolver(healthCheckSchema),
        defaultValues: {}
    });

    useEffect(() => {
        if (!open) return;
        
        // Determine default scheme from target method
        const getDefaultScheme = () => {
            if (initialConfig?.hcScheme) {
                return initialConfig.hcScheme;
            }
            // Default to target method if it's http or https, otherwise default to http
            if (targetMethod === "https") {
                return "https";
            }
            return "http";
        };

        form.reset({
            hcEnabled: initialConfig?.hcEnabled,
            hcPath: initialConfig?.hcPath,
            hcMethod: initialConfig?.hcMethod,
            hcInterval: initialConfig?.hcInterval,
            hcTimeout: initialConfig?.hcTimeout,
            hcStatus: initialConfig?.hcStatus,
            hcHeaders: initialConfig?.hcHeaders,
            hcScheme: getDefaultScheme(),
            hcHostname: initialConfig?.hcHostname,
            hcPort: initialConfig?.hcPort,
            hcFollowRedirects: initialConfig?.hcFollowRedirects,
            hcMode: initialConfig?.hcMode,
            hcUnhealthyInterval: initialConfig?.hcUnhealthyInterval
        });
    }, [open]);

    const watchedEnabled = form.watch("hcEnabled");

    const handleFieldChange = async (fieldName: string, value: any) => {
        try {
            const currentValues = form.getValues();
            const updatedValues = { ...currentValues, [fieldName]: value };
            await onChanges({
                ...updatedValues,
                hcStatus: updatedValues.hcStatus || null
            });
        } catch (error) {
            toast({
                title: t("healthCheckError"),
                description: t("healthCheckErrorDescription"),
                variant: "destructive"
            });
        }
    };

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaContent className="max-w-2xl">
                <CredenzaHeader>
                    <CredenzaTitle>{t("configureHealthCheck")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("configureHealthCheckDescription", {
                            target: targetAddress
                        })}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    <Form {...form}>
                        <form className="space-y-6">
                            {/* Enable Health Checks */}
                            <FormField
                                control={form.control}
                                name="hcEnabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base font-semibold">
                                                {t("enableHealthChecks")}
                                            </FormLabel>
                                            <FormDescription>
                                                {t(
                                                    "enableHealthChecksDescription"
                                                )}
                                            </FormDescription>
                                        </div>
                                        <FormControl>
                                            <Switch
                                                checked={field.value}
                                                onCheckedChange={(value) => {
                                                    field.onChange(value);
                                                    handleFieldChange(
                                                        "hcEnabled",
                                                        value
                                                    );
                                                }}
                                            />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />

                            {watchedEnabled && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="hcScheme"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t("healthScheme")}
                                                    </FormLabel>
                                                    <Select
                                                        onValueChange={(value) => {
                                                            field.onChange(value);
                                                            handleFieldChange(
                                                                "hcScheme",
                                                                value
                                                            );
                                                        }}
                                                        defaultValue={field.value}
                                                    >
                                                        <FormControl>
                                                            <SelectTrigger>
                                                                <SelectValue
                                                                    placeholder={t(
                                                                        "healthSelectScheme"
                                                                    )}
                                                                />
                                                            </SelectTrigger>
                                                        </FormControl>
                                                        <SelectContent>
                                                            <SelectItem value="http">
                                                                HTTP
                                                            </SelectItem>
                                                            <SelectItem value="https">
                                                                HTTPS
                                                            </SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="hcHostname"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t("healthHostname")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            onChange={(e) => {
                                                                field.onChange(
                                                                    e
                                                                );
                                                                handleFieldChange(
                                                                    "hcHostname",
                                                                    e.target
                                                                        .value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="hcPort"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t("healthPort")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcPort",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                        <FormField
                                            control={form.control}
                                            name="hcPath"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t("healthCheckPath")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            {...field}
                                                            onChange={(e) => {
                                                                field.onChange(
                                                                    e
                                                                );
                                                                handleFieldChange(
                                                                    "hcPath",
                                                                    e.target
                                                                        .value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    {/* HTTP Method */}
                                    <FormField
                                        control={form.control}
                                        name="hcMethod"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-base font-semibold">
                                                    {t("httpMethod")}
                                                </FormLabel>
                                                <Select
                                                    onValueChange={(value) => {
                                                        field.onChange(value);
                                                        handleFieldChange(
                                                            "hcMethod",
                                                            value
                                                        );
                                                    }}
                                                    defaultValue={field.value}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue
                                                                placeholder={t(
                                                                    "selectHttpMethod"
                                                                )}
                                                            />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="GET">
                                                            GET
                                                        </SelectItem>
                                                        <SelectItem value="POST">
                                                            POST
                                                        </SelectItem>
                                                        <SelectItem value="HEAD">
                                                            HEAD
                                                        </SelectItem>
                                                        <SelectItem value="PUT">
                                                            PUT
                                                        </SelectItem>
                                                        <SelectItem value="DELETE">
                                                            DELETE
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Check Interval, Timeout, and Retry Attempts */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <FormField
                                            control={form.control}
                                            name="hcInterval"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t(
                                                            "healthyIntervalSeconds"
                                                        )}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcInterval",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="hcUnhealthyInterval"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t(
                                                            "unhealthyIntervalSeconds"
                                                        )}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcUnhealthyInterval",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="hcTimeout"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel className="text-base font-semibold">
                                                        {t("timeoutSeconds")}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="number"
                                                            {...field}
                                                            onChange={(e) => {
                                                                const value =
                                                                    parseInt(
                                                                        e.target
                                                                            .value
                                                                    );
                                                                field.onChange(
                                                                    value
                                                                );
                                                                handleFieldChange(
                                                                    "hcTimeout",
                                                                    value
                                                                );
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormDescription>
                                            {t("timeIsInSeconds")}
                                        </FormDescription>
                                    </div>

                                    {/* Expected Response Codes */}
                                    <FormField
                                        control={form.control}
                                        name="hcStatus"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-base font-semibold">
                                                    {t("expectedResponseCodes")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="number"
                                                        {...field}
                                                        value={
                                                            field.value || ""
                                                        }
                                                        onChange={(e) => {
                                                            const value =
                                                                parseInt(
                                                                    e.target
                                                                        .value
                                                                );
                                                            field.onChange(
                                                                value
                                                            );
                                                            handleFieldChange(
                                                                "hcStatus",
                                                                value
                                                            );
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t(
                                                        "expectedResponseCodesDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {/* Custom Headers */}
                                    <FormField
                                        control={form.control}
                                        name="hcHeaders"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-base font-semibold">
                                                    {t("customHeaders")}
                                                </FormLabel>
                                                <FormControl>
                                                    <HeadersInput
                                                        value={field.value}
                                                        onChange={(value) => {
                                                            field.onChange(value);
                                                            handleFieldChange(
                                                                "hcHeaders",
                                                                value
                                                            );
                                                        }}
                                                        rows={4}
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    {t(
                                                        "customHeadersDescription"
                                                    )}
                                                </FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </div>
                            )}
                        </form>
                    </Form>
                </CredenzaBody>
                <CredenzaFooter>
                    <Button onClick={() => setOpen(false)}>{t("done")}</Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
