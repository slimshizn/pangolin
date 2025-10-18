"use client";

import { useTranslations } from "next-intl";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "./ui/button";
import { ArrowUpDown } from "lucide-react";
import CopyToClipboard from "./CopyToClipboard";
import { Badge } from "./ui/badge";
import moment from "moment";
import { DataTable } from "./ui/data-table";
import { GeneratedLicenseKey } from "@server/routers/generatedLicense/types";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import GenerateLicenseKeyForm from "./GenerateLicenseKeyForm";

type GnerateLicenseKeysTableProps = {
    licenseKeys: GeneratedLicenseKey[];
    orgId: string;
};

function obfuscateLicenseKey(key: string): string {
    if (key.length <= 8) return key;
    const firstPart = key.substring(0, 4);
    const lastPart = key.substring(key.length - 4);
    return `${firstPart}••••••••••••••••••••${lastPart}`;
}

export default function GenerateLicenseKeysTable({
    licenseKeys,
    orgId
}: GnerateLicenseKeysTableProps) {
    const t = useTranslations();
    const router = useRouter();

    const { env } = useEnvContext();
    const api = createApiClient({ env });

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showGenerateForm, setShowGenerateForm] = useState(false);

    const handleLicenseGenerated = () => {
        // Refresh the data after license is generated
        refreshData();
    };

    const refreshData = async () => {
        console.log("Data refreshed");
        setIsRefreshing(true);
        try {
            await new Promise((resolve) => setTimeout(resolve, 200));
            router.refresh();
        } catch (error) {
            toast({
                title: t("error"),
                description: t("refreshError"),
                variant: "destructive"
            });
        } finally {
            setIsRefreshing(false);
        }
    };

    const columns: ColumnDef<GeneratedLicenseKey>[] = [
        {
            accessorKey: "licenseKey",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("licenseKey")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const licenseKey = row.original.licenseKey;
                return (
                    <CopyToClipboard
                        text={licenseKey}
                        displayText={obfuscateLicenseKey(licenseKey)}
                    />
                );
            }
        },
        {
            accessorKey: "instanceName",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("instanceName")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                return row.original.instanceName || "-";
            }
        },
        {
            accessorKey: "valid",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("valid")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                return row.original.isValid ? (
                    <Badge variant="green">{t("yes")}</Badge>
                ) : (
                    <Badge variant="red">{t("no")}</Badge>
                );
            }
        },
        {
            accessorKey: "type",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("type")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const tier = row.original.tier;
                return tier === "enterprise"
                    ? t("licenseTierEnterprise")
                    : t("licenseTierPersonal");
            }
        },
        {
            accessorKey: "terminateAt",
            header: ({ column }) => {
                return (
                    <Button
                        variant="ghost"
                        onClick={() =>
                            column.toggleSorting(column.getIsSorted() === "asc")
                        }
                    >
                        {t("licenseTableValidUntil")}
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                    </Button>
                );
            },
            cell: ({ row }) => {
                const termianteAt = row.original.expiresAt;
                return moment(termianteAt).format("lll");
            }
        }
    ];

    return (
        <>
            <DataTable
                columns={columns}
                data={licenseKeys}
                persistPageSize="licenseKeys-table"
                title={t("licenseKeys")}
                searchPlaceholder={t("licenseKeySearch")}
                searchColumn="licenseKey"
                onRefresh={refreshData}
                isRefreshing={isRefreshing}
                addButtonText={t("generateLicenseKey")}
                onAdd={() => {
                    setShowGenerateForm(true);
                }}
            />

            <GenerateLicenseKeyForm
                open={showGenerateForm}
                setOpen={setShowGenerateForm}
                orgId={orgId}
                onGenerated={handleLicenseGenerated}
            />
        </>
    );
}
