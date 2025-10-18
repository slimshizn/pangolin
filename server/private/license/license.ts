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

import { db, HostMeta } from "@server/db";
import { hostMeta, licenseKey } from "@server/db";
import logger from "@server/logger";
import NodeCache from "node-cache";
import { validateJWT } from "./licenseJwt";
import { eq } from "drizzle-orm";
import moment from "moment";
import { encrypt, decrypt } from "@server/lib/crypto";
import {
    LicenseKeyCache,
    LicenseKeyTier,
    LicenseKeyType,
    LicenseStatus
} from "@server/license/license";
import { setHostMeta } from "@server/lib/hostMeta";

type ActivateLicenseKeyAPIResponse = {
    data: {
        instanceId: string;
    };
    success: boolean;
    error: string;
    message: string;
    status: number;
};

type ValidateLicenseAPIResponse = {
    data: {
        licenseKeys: {
            [key: string]: string;
        };
    };
    success: boolean;
    error: string;
    message: string;
    status: number;
};

type TokenPayload = {
    valid: boolean;
    type: LicenseKeyType;
    tier: LicenseKeyTier;
    quantity: number;
    terminateAt: string; // ISO
    iat: number; // Issued at
};

export class License {
    private phoneHomeInterval = 6 * 60 * 60; // 6 hours = 6 * 60 * 60 = 21600 seconds
    private serverBaseUrl = "https://api.fossorial.io";
    private validationServerUrl = `${this.serverBaseUrl}/api/v1/license/enterprise/validate`;
    private activationServerUrl = `${this.serverBaseUrl}/api/v1/license/enterprise/activate`;

    private statusCache = new NodeCache({ stdTTL: this.phoneHomeInterval });
    private licenseKeyCache = new NodeCache();

    private statusKey = "status";
    private serverSecret!: string;

    private publicKey = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx9RKc8cw+G8r7h/xeozF
FNkRDggQfYO6Ae+EWHGujZ9WYAZ10spLh9F/zoLhhr3XhsjpoRXwMfgNuO5HstWf
CYM20I0l7EUUMWEyWd4tZLd+5XQ4jY5xWOCWyFJAGQSp7flcRmxdfde+l+xg9eKl
apbY84aVp09/GqM96hCS+CsQZrhohu/aOqYVB/eAhF01qsbmiZ7Y3WtdhTldveYt
h4mZWGmjf8d/aEgePf/tk1gp0BUxf+Ae5yqoAqU+6aiFbjJ7q1kgxc18PWFGfE9y
zSk+OZk887N5ThQ52154+oOUCMMR2Y3t5OH1hVZod51vuY2u5LsQXsf+87PwB91y
LQIDAQAB
-----END PUBLIC KEY-----`;

    constructor(private hostMeta: HostMeta) {
        setInterval(
            async () => {
                await this.check();
            },
            1000 * 60 * 60
        );
    }

    public listKeys(): LicenseKeyCache[] {
        const keys = this.licenseKeyCache.keys();
        return keys.map((key) => {
            return this.licenseKeyCache.get<LicenseKeyCache>(key)!;
        });
    }

    public setServerSecret(secret: string) {
        this.serverSecret = secret;
    }

    public async forceRecheck() {
        this.statusCache.flushAll();
        this.licenseKeyCache.flushAll();

        return await this.check();
    }

    public async isUnlocked(): Promise<boolean> {
        const status = await this.check();
        if (status.isHostLicensed) {
            if (status.isLicenseValid) {
                return true;
            }
        }
        return false;
    }

    public async check(): Promise<LicenseStatus> {
        const status: LicenseStatus = {
            hostId: this.hostMeta.hostMetaId,
            isHostLicensed: true,
            isLicenseValid: false
        };

        try {
            if (this.statusCache.has(this.statusKey)) {
                const res = this.statusCache.get("status") as LicenseStatus;
                return res;
            }
            // Invalidate all
            this.licenseKeyCache.flushAll();

            const allKeysRes = await db.select().from(licenseKey);

            if (allKeysRes.length === 0) {
                status.isHostLicensed = false;
                return status;
            }

            let foundHostKey = false;
            // Validate stored license keys
            for (const key of allKeysRes) {
                try {
                    // Decrypt the license key and token
                    const decryptedKey = decrypt(
                        key.licenseKeyId,
                        this.serverSecret
                    );
                    const decryptedToken = decrypt(
                        key.token,
                        this.serverSecret
                    );

                    const payload = validateJWT<TokenPayload>(
                        decryptedToken,
                        this.publicKey
                    );

                    this.licenseKeyCache.set<LicenseKeyCache>(decryptedKey, {
                        licenseKey: decryptedKey,
                        licenseKeyEncrypted: key.licenseKeyId,
                        valid: payload.valid,
                        type: payload.type,
                        tier: payload.tier,
                        iat: new Date(payload.iat * 1000),
                        terminateAt: new Date(payload.terminateAt)
                    });

                    if (payload.type === "host") {
                        foundHostKey = true;
                    }
                } catch (e) {
                    logger.error(
                        `Error validating license key: ${key.licenseKeyId}`
                    );
                    logger.error(e);

                    this.licenseKeyCache.set<LicenseKeyCache>(
                        key.licenseKeyId,
                        {
                            licenseKey: key.licenseKeyId,
                            licenseKeyEncrypted: key.licenseKeyId,
                            valid: false
                        }
                    );
                }
            }

            if (!foundHostKey && allKeysRes.length) {
                logger.debug("No host license key found");
                status.isHostLicensed = false;
            }

            const keys = allKeysRes.map((key) => ({
                licenseKey: decrypt(key.licenseKeyId, this.serverSecret),
                instanceId: decrypt(key.instanceId, this.serverSecret)
            }));

            let apiResponse: ValidateLicenseAPIResponse | undefined;
            try {
                // Phone home to validate license keys
                apiResponse = await this.phoneHome(keys, false);

                if (!apiResponse?.success) {
                    throw new Error(apiResponse?.error);
                }
            } catch (e) {
                logger.error("Error communicating with license server:");
                logger.error(e);
            }

            // Check and update all license keys with server response
            for (const key of keys) {
                try {
                    const cached = this.licenseKeyCache.get<LicenseKeyCache>(
                        key.licenseKey
                    )!;
                    const licenseKeyRes =
                        apiResponse?.data?.licenseKeys[key.licenseKey];

                    if (!apiResponse || !licenseKeyRes) {
                        logger.debug(
                            `No response from server for license key: ${key.licenseKey}`
                        );
                        if (cached.iat) {
                            const exp = moment(cached.iat)
                                .add(7, "days")
                                .toDate();
                            if (exp > new Date()) {
                                logger.debug(
                                    `Using cached license key: ${key.licenseKey}, valid ${cached.valid}`
                                );
                                continue;
                            }
                        }

                        logger.debug(
                            `Can't trust license key: ${key.licenseKey}`
                        );
                        cached.valid = false;
                        this.licenseKeyCache.set<LicenseKeyCache>(
                            key.licenseKey,
                            cached
                        );
                        continue;
                    }

                    const payload = validateJWT<TokenPayload>(
                        licenseKeyRes,
                        this.publicKey
                    );
                    cached.valid = payload.valid;
                    cached.type = payload.type;
                    cached.tier = payload.tier;
                    cached.iat = new Date(payload.iat * 1000);
                    cached.terminateAt = new Date(payload.terminateAt);

                    // Encrypt the updated token before storing
                    const encryptedKey = encrypt(
                        key.licenseKey,
                        this.serverSecret
                    );
                    const encryptedToken = encrypt(
                        licenseKeyRes,
                        this.serverSecret
                    );

                    await db
                        .update(licenseKey)
                        .set({
                            token: encryptedToken
                        })
                        .where(eq(licenseKey.licenseKeyId, encryptedKey));

                    this.licenseKeyCache.set<LicenseKeyCache>(
                        key.licenseKey,
                        cached
                    );
                } catch (e) {
                    logger.error(`Error validating license key: ${key}`);
                    logger.error(e);
                }
            }

            // Compute host status
            for (const key of keys) {
                const cached = this.licenseKeyCache.get<LicenseKeyCache>(
                    key.licenseKey
                )!;

                if (cached.type === "host") {
                    status.isLicenseValid = cached.valid;
                    status.tier = cached.tier;
                }

                if (!cached.valid) {
                    continue;
                }
            }
        } catch (error) {
            logger.error("Error checking license status:");
            logger.error(error);
        }

        this.statusCache.set(this.statusKey, status);
        return status;
    }

    public async activateLicenseKey(key: string) {
        // Encrypt the license key before storing
        const encryptedKey = encrypt(key, this.serverSecret);

        const [existingKey] = await db
            .select()
            .from(licenseKey)
            .where(eq(licenseKey.licenseKeyId, encryptedKey))
            .limit(1);

        if (existingKey) {
            throw new Error("License key already exists");
        }

        let instanceId: string | undefined;
        try {
            // Call activate
            const apiResponse = await fetch(this.activationServerUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    licenseKey: key,
                    instanceName: this.hostMeta.hostMetaId
                })
            });

            const data = await apiResponse.json();

            if (!data.success) {
                throw new Error(`${data.message || data.error}`);
            }

            const response = data as ActivateLicenseKeyAPIResponse;

            if (!response.data) {
                throw new Error("No response from server");
            }

            if (!response.data.instanceId) {
                throw new Error("No instance ID in response");
            }

            logger.debug("Activated license key, instance ID:", {
                instanceId: response.data.instanceId
            });

            instanceId = response.data.instanceId;
        } catch (error) {
            throw Error(`Error activating license key: ${error}`);
        }

        // Phone home to validate license key
        const keys = [
            {
                licenseKey: key,
                instanceId: instanceId!
            }
        ];

        let validateResponse: ValidateLicenseAPIResponse;
        try {
            validateResponse = await this.phoneHome(keys, false);

            if (!validateResponse) {
                throw new Error("No response from server");
            }

            if (!validateResponse.success) {
                throw new Error(validateResponse.error);
            }

            // Validate the license key
            const licenseKeyRes = validateResponse.data.licenseKeys[key];
            if (!licenseKeyRes) {
                throw new Error("Invalid license key");
            }

            const payload = validateJWT<TokenPayload>(
                licenseKeyRes,
                this.publicKey
            );

            if (!payload.valid) {
                throw new Error("Invalid license key");
            }

            const encryptedToken = encrypt(licenseKeyRes, this.serverSecret);
            // Encrypt the instanceId before storing
            const encryptedInstanceId = encrypt(instanceId!, this.serverSecret);

            // Store the license key in the database
            await db.insert(licenseKey).values({
                licenseKeyId: encryptedKey,
                token: encryptedToken,
                instanceId: encryptedInstanceId
            });
        } catch (error) {
            throw Error(`Error validating license key: ${error}`);
        }

        // Invalidate the cache and re-compute the status
        return await this.forceRecheck();
    }

    private async phoneHome(
        keys: {
            licenseKey: string;
            instanceId: string;
        }[],
        doDecrypt = true
    ): Promise<ValidateLicenseAPIResponse> {
        // Decrypt the instanceIds before sending to the server
        const decryptedKeys = keys.map((key) => ({
            licenseKey: key.licenseKey,
            instanceId:
                key.instanceId && doDecrypt
                    ? decrypt(key.instanceId, this.serverSecret)
                    : key.instanceId
        }));

        const response = await fetch(this.validationServerUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                licenseKeys: decryptedKeys,
                instanceName: this.hostMeta.hostMetaId
            })
        });

        const data = await response.json();

        return data as ValidateLicenseAPIResponse;
    }
}

await setHostMeta();

const [info] = await db.select().from(hostMeta).limit(1);

if (!info) {
    throw new Error("Host information not found");
}

export const license = new License(info);

export default license;
