"use client";

import LicenseStatusContext from "@app/contexts/licenseStatusContext";
import { build } from "@server/build";
import { LicenseStatus } from "@server/license/license";
import { useState } from "react";

interface ProviderProps {
    children: React.ReactNode;
    licenseStatus: LicenseStatus | null;
}

export function LicenseStatusProvider({
    children,
    licenseStatus
}: ProviderProps) {
    const [licenseStatusState, setLicenseStatusState] =
        useState<LicenseStatus | null>(licenseStatus);

    const updateLicenseStatus = (updatedLicenseStatus: LicenseStatus) => {
        setLicenseStatusState((prev) => {
            return {
                ...updatedLicenseStatus
            };
        });
    };

    const isUnlocked = () => {
        if (licenseStatusState?.isHostLicensed) {
            if (licenseStatusState?.isLicenseValid) {
                return true;
            }
        }
        return false;
    };

    const isLicenseViolation = () => {
        if (
            licenseStatusState?.isHostLicensed &&
            !licenseStatusState?.isLicenseValid
        ) {
            return true;
        }
        return false;
    };

    return (
        <LicenseStatusContext.Provider
            value={{
                licenseStatus: licenseStatusState,
                updateLicenseStatus,
                isLicenseViolation,
                isUnlocked
            }}
        >
            {children}
        </LicenseStatusContext.Provider>
    );
}

export default LicenseStatusProvider;
