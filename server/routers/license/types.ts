import { LicenseStatus, LicenseKeyCache } from "@server/license/license";

export type ActivateLicenseStatus = LicenseStatus;

export type DeleteLicenseKeyResponse = LicenseStatus;

export type GetLicenseStatusResponse = LicenseStatus;

export type ListLicenseKeysResponse = LicenseKeyCache[];

export type RecheckStatusResponse = LicenseStatus;