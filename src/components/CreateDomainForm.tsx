"use client";

import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import { useToast } from "@app/hooks/useToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import { formatAxiosError } from "@app/lib/api";
import { CreateDomainResponse } from "@server/routers/domain/createOrgDomain";
import { StrategySelect } from "@app/components/StrategySelect";
import { AxiosResponse } from "axios";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { InfoIcon, AlertTriangle, Globe } from "lucide-react";
import CopyToClipboard from "@app/components/CopyToClipboard";
import {
    InfoSection,
    InfoSectionContent,
    InfoSections,
    InfoSectionTitle
} from "@app/components/InfoSection";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { build } from "@server/build";
import { toASCII, toUnicode } from 'punycode';


// Helper functions for Unicode domain handling
function toPunycode(domain: string): string {
    try {
        const parts = toASCII(domain);
        return parts;
    } catch (error) {
        return domain.toLowerCase();
    }
}

function fromPunycode(domain: string): string {
    try {
        const parts = toUnicode(domain);
        return parts;
    } catch (error) {
        return domain;
    }
}

function isValidDomainFormat(domain: string): boolean {
    const unicodeRegex = /^(?!:\/\/)([^\s.]+\.)*[^\s.]+$/;

    if (!unicodeRegex.test(domain)) {
        return false;
    }

    const parts = domain.split('.');
    for (const part of parts) {
        if (part.length === 0 || part.startsWith('-') || part.endsWith('-')) {
            return false;
        }
        if (part.length > 63) {
            return false;
        }
    }

    if (domain.length > 253) {
        return false;
    }

    return true;
}

const formSchema = z.object({
    baseDomain: z
        .string()
        .min(1, "Domain is required")
        .refine((val) => isValidDomainFormat(val), "Invalid domain format")
        .transform((val) => toPunycode(val)),
    type: z.enum(["ns", "cname", "wildcard"])
});

type FormValues = z.infer<typeof formSchema>;

type CreateDomainFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    onCreated?: (domain: CreateDomainResponse) => void;
};

export default function CreateDomainForm({
    open,
    setOpen,
    onCreated
}: CreateDomainFormProps) {
    const [loading, setLoading] = useState(false);
    const [createdDomain, setCreatedDomain] =
        useState<CreateDomainResponse | null>(null);
    const api = createApiClient(useEnvContext());
    const t = useTranslations();
    const { toast } = useToast();
    const { org } = useOrgContext();
    const { env } = useEnvContext();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            baseDomain: "",
            type: build == "oss" || !env.flags.usePangolinDns ? "wildcard" : "ns"
        }
    });

    function reset() {
        form.reset();
        setLoading(false);
        setCreatedDomain(null);
    }

    async function onSubmit(values: FormValues) {
        setLoading(true);
        try {
            const response = await api.put<AxiosResponse<CreateDomainResponse>>(
                `/org/${org.org.orgId}/domain`,
                values
            );
            const domainData = response.data.data;
            setCreatedDomain(domainData);
            toast({
                title: t("success"),
                description: t("domainCreatedDescription")
            });
            onCreated?.(domainData);
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

    const baseDomain = form.watch("baseDomain");
    const domainInputValue = form.watch("baseDomain") || "";

    const punycodePreview = useMemo(() => {
        if (!domainInputValue) return "";
        const punycode = toPunycode(domainInputValue);
        return punycode !== domainInputValue.toLowerCase() ? punycode : "";
    }, [domainInputValue]);

    let domainOptions: any = [];
    if (build != "oss" && env.flags.usePangolinDns) {
        domainOptions = [
            {
                id: "ns",
                title: t("selectDomainTypeNsName"),
                description: t("selectDomainTypeNsDescription")
            },
            {
                id: "cname",
                title: t("selectDomainTypeCnameName"),
                description: t("selectDomainTypeCnameDescription")
            }
        ];
    } else {
        domainOptions = [
            {
                id: "wildcard",
                title: t("selectDomainTypeWildcardName"),
                description: t("selectDomainTypeWildcardDescription")
            }
        ];
    }

    return (
        <Credenza
            open={open}
            onOpenChange={(val) => {
                setOpen(val);
                reset();
            }}
        >
            <CredenzaContent>
                <CredenzaHeader>
                    <CredenzaTitle>{t("domainAdd")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("domainAddDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    {!createdDomain ? (
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="create-domain-form"
                            >
                                <FormField
                                    control={form.control}
                                    name="type"
                                    render={({ field }) => (
                                        <FormItem>
                                            <StrategySelect
                                                options={domainOptions}
                                                defaultValue={field.value}
                                                onChange={field.onChange}
                                                cols={1}
                                            />
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="baseDomain"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t("domain")}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    placeholder="example.com"
                                                    {...field}
                                                />
                                            </FormControl>
                                            {punycodePreview && (
                                                <FormDescription className="flex items-center gap-2 text-xs">
                                                    <Alert>
                                                        <Globe className="h-4 w-4" />
                                                        <AlertTitle>{t("internationaldomaindetected")}</AlertTitle>
                                                        <AlertDescription>
                                                            <div className="mt-2 space-y-1">
                                                                <p>{t("willbestoredas")} <code className="font-mono px-1 py-0.5 rounded">{punycodePreview}</code></p>
                                                            </div>
                                                        </AlertDescription>
                                                    </Alert>
                                                </FormDescription>
                                            )}
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    ) : (
                        <div className="space-y-6">
                            <Alert variant="default">
                                <InfoIcon className="h-4 w-4" />
                                <AlertTitle className="font-semibold">
                                    {t("createDomainAddDnsRecords")}
                                </AlertTitle>
                                <AlertDescription>
                                    {t("createDomainAddDnsRecordsDescription")}
                                </AlertDescription>
                            </Alert>

                            <div className="space-y-4">
                                {createdDomain.nsRecords &&
                                    createdDomain.nsRecords.length > 0 && (
                                        <div>
                                            <h3 className="font-medium mb-3">
                                                {t("createDomainNsRecords")}
                                            </h3>
                                            <InfoSections cols={1}>
                                                <InfoSection>
                                                    <InfoSectionTitle>
                                                        {t("createDomainRecord")}
                                                    </InfoSectionTitle>
                                                    <InfoSectionContent>
                                                        <div className="space-y-2">
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-sm font-medium">
                                                                    {t(
                                                                        "createDomainType"
                                                                    )}
                                                                </span>
                                                                <span className="text-sm font-mono">
                                                                    NS
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center">
                                                                <span className="text-sm font-medium">
                                                                    {t(
                                                                        "createDomainName"
                                                                    )}
                                                                </span>
                                                                <div className="text-right">
                                                                    <span className="text-sm font-mono block">
                                                                        {fromPunycode(baseDomain)}
                                                                    </span>
                                                                    {fromPunycode(baseDomain) !== baseDomain && (
                                                                        <span className="text-xs text-muted-foreground font-mono">
                                                                            ({baseDomain})
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="text-sm font-medium">
                                                                {t(
                                                                    "createDomainValue"
                                                                )}
                                                            </span>
                                                            {createdDomain.nsRecords.map(
                                                                (
                                                                    nsRecord,
                                                                    index
                                                                ) => (
                                                                    <div
                                                                        className="flex justify-between items-center"
                                                                        key={index}
                                                                    >
                                                                        <CopyToClipboard
                                                                            text={
                                                                                nsRecord
                                                                            }
                                                                        />
                                                                    </div>
                                                                )
                                                            )}
                                                        </div>
                                                    </InfoSectionContent>
                                                </InfoSection>
                                            </InfoSections>
                                        </div>
                                    )}

                                {createdDomain.cnameRecords &&
                                    createdDomain.cnameRecords.length > 0 && (
                                        <div>
                                            <h3 className="font-medium mb-3">
                                                {t("createDomainCnameRecords")}
                                            </h3>
                                            <InfoSections cols={1}>
                                                {createdDomain.cnameRecords.map(
                                                    (cnameRecord, index) => (
                                                        <InfoSection
                                                            key={index}
                                                        >
                                                            <InfoSectionTitle>
                                                                {t(
                                                                    "createDomainRecordNumber",
                                                                    {
                                                                        number:
                                                                            index +
                                                                            1
                                                                    }
                                                                )}
                                                            </InfoSectionTitle>
                                                            <InfoSectionContent>
                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainType"
                                                                            )}
                                                                        </span>
                                                                        <span className="text-sm font-mono">
                                                                            CNAME
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainName"
                                                                            )}
                                                                        </span>
                                                                        <div className="text-right">
                                                                            <span className="text-sm font-mono block">
                                                                                {fromPunycode(cnameRecord.baseDomain)}
                                                                            </span>
                                                                            {fromPunycode(cnameRecord.baseDomain) !== cnameRecord.baseDomain && (
                                                                                <span className="text-xs text-muted-foreground font-mono">
                                                                                    ({cnameRecord.baseDomain})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainValue"
                                                                            )}
                                                                        </span>
                                                                        <CopyToClipboard
                                                                            text={
                                                                                cnameRecord.value
                                                                            }
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </InfoSectionContent>
                                                        </InfoSection>
                                                    )
                                                )}
                                            </InfoSections>
                                        </div>
                                    )}

                                {createdDomain.aRecords &&
                                    createdDomain.aRecords.length > 0 && (
                                        <div>
                                            <h3 className="font-medium mb-3">
                                                {t("createDomainARecords")}
                                            </h3>
                                            <InfoSections cols={1}>
                                                {createdDomain.aRecords.map(
                                                    (aRecord, index) => (
                                                        <InfoSection
                                                            key={index}
                                                        >
                                                            <InfoSectionTitle>
                                                                {t(
                                                                    "createDomainRecordNumber",
                                                                    {
                                                                        number:
                                                                            index +
                                                                            1
                                                                    }
                                                                )}
                                                            </InfoSectionTitle>
                                                            <InfoSectionContent>
                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainType"
                                                                            )}
                                                                        </span>
                                                                        <span className="text-sm font-mono">
                                                                            A
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainName"
                                                                            )}
                                                                        </span>
                                                                        <div className="text-right">
                                                                            <span className="text-sm font-mono block">
                                                                                {fromPunycode(aRecord.baseDomain)}
                                                                            </span>
                                                                            {fromPunycode(aRecord.baseDomain) !== aRecord.baseDomain && (
                                                                                <span className="text-xs text-muted-foreground font-mono">
                                                                                    ({aRecord.baseDomain})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainValue"
                                                                            )}
                                                                        </span>
                                                                        <span className="text-sm font-mono">
                                                                            {
                                                                                aRecord.value
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </InfoSectionContent>
                                                        </InfoSection>
                                                    )
                                                )}
                                            </InfoSections>
                                        </div>
                                    )}
                                {createdDomain.txtRecords &&
                                    createdDomain.txtRecords.length > 0 && (
                                        <div>
                                            <h3 className="font-medium mb-3">
                                                {t("createDomainTxtRecords")}
                                            </h3>
                                            <InfoSections cols={1}>
                                                {createdDomain.txtRecords.map(
                                                    (txtRecord, index) => (
                                                        <InfoSection
                                                            key={index}
                                                        >
                                                            <InfoSectionTitle>
                                                                {t(
                                                                    "createDomainRecordNumber",
                                                                    {
                                                                        number:
                                                                            index +
                                                                            1
                                                                    }
                                                                )}
                                                            </InfoSectionTitle>
                                                            <InfoSectionContent>
                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainType"
                                                                            )}
                                                                        </span>
                                                                        <span className="text-sm font-mono">
                                                                            TXT
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainName"
                                                                            )}
                                                                        </span>
                                                                        <div className="text-right">
                                                                            <span className="text-sm font-mono block">
                                                                                {fromPunycode(txtRecord.baseDomain)}
                                                                            </span>
                                                                            {fromPunycode(txtRecord.baseDomain) !== txtRecord.baseDomain && (
                                                                                <span className="text-xs text-muted-foreground font-mono">
                                                                                    ({txtRecord.baseDomain})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex justify-between items-center">
                                                                        <span className="text-sm font-medium">
                                                                            {t(
                                                                                "createDomainValue"
                                                                            )}
                                                                        </span>
                                                                        <CopyToClipboard
                                                                            text={
                                                                                txtRecord.value
                                                                            }
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </InfoSectionContent>
                                                        </InfoSection>
                                                    )
                                                )}
                                            </InfoSections>
                                        </div>
                                    )}
                            </div>

                            {build != "oss" && env.flags.usePangolinDns && (
                                    <Alert variant="destructive">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle className="font-semibold">
                                            {t("createDomainSaveTheseRecords")}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {t(
                                                "createDomainSaveTheseRecordsDescription"
                                            )}
                                        </AlertDescription>
                                    </Alert>
                                )}

                            <Alert variant="info">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle className="font-semibold">
                                    {t("createDomainDnsPropagation")}
                                </AlertTitle>
                                <AlertDescription>
                                    {t("createDomainDnsPropagationDescription")}
                                </AlertDescription>
                            </Alert>
                        </div>
                    )}
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">{t("close")}</Button>
                    </CredenzaClose>
                    {!createdDomain && (
                        <Button
                            type="submit"
                            form="create-domain-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t("domainCreate")}
                        </Button>
                    )}
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
