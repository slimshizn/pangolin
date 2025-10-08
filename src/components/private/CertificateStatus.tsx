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

import { Button } from "@/components/ui/button";
import { RotateCw } from "lucide-react";
import { useCertificate } from "@app/hooks/privateUseCertificate";
import { useTranslations } from "next-intl";

type CertificateStatusProps = {
    orgId: string;
    domainId: string;
    fullDomain: string;
    autoFetch?: boolean;
    showLabel?: boolean;
    className?: string;
    onRefresh?: () => void;
    polling?: boolean;
    pollingInterval?: number;
};

export default function CertificateStatus({
    orgId,
    domainId,
    fullDomain,
    autoFetch = true,
    showLabel = true,
    className = "",
    onRefresh,
    polling = false,
    pollingInterval = 5000
}: CertificateStatusProps) {
    const t = useTranslations();
    const { cert, certLoading, certError, refreshing, refreshCert } = useCertificate({
        orgId,
        domainId,
        fullDomain,
        autoFetch,
        polling,
        pollingInterval
    });

    const handleRefresh = async () => {
        await refreshCert();
        onRefresh?.();
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case "valid":
                return "text-green-500";
            case "pending":
            case "requested":
                return "text-yellow-500";
            case "expired":
            case "failed":
                return "text-red-500";
            default:
                return "text-muted-foreground";
        }
    };

    const shouldShowRefreshButton = (status: string, updatedAt: string) => {
        return (
            status === "failed" ||
            status === "expired" ||
            (status === "requested" &&
                updatedAt && new Date(updatedAt).getTime() < Date.now() - 5 * 60 * 1000)
        );
    };

    if (certLoading) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                {showLabel && (
                    <span className="text-sm font-medium">
                        {t("certificateStatus")}:
                    </span>
                )}
                <span className="text-sm text-muted-foreground">
                    {t("loading")}
                </span>
            </div>
        );
    }

    if (certError) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                {showLabel && (
                    <span className="text-sm font-medium">
                        {t("certificateStatus")}:
                    </span>
                )}
                <span className="text-sm text-red-500">
                    {certError}
                </span>
            </div>
        );
    }

    if (!cert) {
        return (
            <div className={`flex items-center gap-2 ${className}`}>
                {showLabel && (
                    <span className="text-sm font-medium">
                        {t("certificateStatus")}:
                    </span>
                )}
                <span className="text-sm text-muted-foreground">
                    {t("none", { defaultValue: "None" })}
                </span>
            </div>
        );
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            {showLabel && (
                <span className="text-sm font-medium">
                    {t("certificateStatus")}:
                </span>
            )}
            <span className={`text-sm ${getStatusColor(cert.status)}`}>
                <span className="inline-flex items-center">
                    {cert.status.charAt(0).toUpperCase() + cert.status.slice(1)}
                    {shouldShowRefreshButton(cert.status, cert.updatedAt) && (
                        <Button
                            size="icon"
                            variant="ghost"
                            className="ml-2 p-0 h-auto align-middle"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            title={t("restartCertificate", { defaultValue: "Restart Certificate" })}
                        >
                            <RotateCw
                                className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`}
                            />
                        </Button>
                    )}
                </span>
            </span>
        </div>
    );
}
