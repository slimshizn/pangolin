export type GetCertificateResponse = {
    certId: number;
    domain: string;
    domainId: string;
    wildcard: boolean;
    status: string; // pending, requested, valid, expired, failed
    expiresAt: string | null;
    lastRenewalAttempt: Date | null;
    createdAt: string;
    updatedAt: string;
    errorMessage?: string | null;
    renewalCount: number;
}