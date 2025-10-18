export type GeneratedLicenseKey = {
    instanceName: string | null;
    licenseKey: string;
    expiresAt: string;
    isValid: boolean;
    createdAt: string;
    tier: string;
    type: string;
};

export type ListGeneratedLicenseKeysResponse = GeneratedLicenseKey[];

export type NewLicenseKey = {
    licenseKey: {
        id: number;
        instanceName: string | null;
        instanceId: string;
        licenseKey: string;
        tier: string;
        type: string;
        quantity: number;
        isValid: boolean;
        updatedAt: string;
        createdAt: string;
        expiresAt: string;
        orgId: string;
    };
};

export type GenerateNewLicenseResponse = NewLicenseKey;