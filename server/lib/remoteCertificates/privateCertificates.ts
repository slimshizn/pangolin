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

import config from "../config";
import { certificates, db } from "@server/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { decryptData } from "../encryption";
import * as fs from "fs";

export async function getValidCertificatesForDomains(
    domains: Set<string>
): Promise<
    Array<{
        id: number;
        domain: string;
        wildcard: boolean | null;
        certFile: string | null;
        keyFile: string | null;
        expiresAt: number | null;
        updatedAt?: number | null;
    }>
> {
    if (domains.size === 0) {
        return [];
    }

    const domainArray = Array.from(domains);

    // TODO: add more foreign keys to make this query more efficient - we dont need to keep getting every certificate
    const validCerts = await db
        .select({
            id: certificates.certId,
            domain: certificates.domain,
            certFile: certificates.certFile,
            keyFile: certificates.keyFile,
            expiresAt: certificates.expiresAt,
            updatedAt: certificates.updatedAt,
            wildcard: certificates.wildcard
        })
        .from(certificates)
        .where(
            and(
                eq(certificates.status, "valid"),
                isNotNull(certificates.certFile),
                isNotNull(certificates.keyFile)
            )
        );

    // Filter certificates for the specified domains and if it is a wildcard then you can match on everything up to the first dot
    const validCertsFiltered = validCerts.filter((cert) => {
        return (
            domainArray.includes(cert.domain) ||
            (cert.wildcard &&
                domainArray.some((domain) =>
                    domain.endsWith(`.${cert.domain}`)
                ))
        );
    });

    const encryptionKeyPath = config.getRawPrivateConfig().server.encryption_key_path;

    if (!fs.existsSync(encryptionKeyPath)) {
        throw new Error(
            "Encryption key file not found. Please generate one first."
        );
    }

    const encryptionKeyHex = fs.readFileSync(encryptionKeyPath, "utf8").trim();
    const encryptionKey = Buffer.from(encryptionKeyHex, "hex");

    const validCertsDecrypted = validCertsFiltered.map((cert) => {
        // Decrypt and save certificate file
        const decryptedCert = decryptData(
            cert.certFile!, // is not null from query
            encryptionKey
        );

        // Decrypt and save key file
        const decryptedKey = decryptData(cert.keyFile!, encryptionKey);

        // Return only the certificate data without org information
        return {
            ...cert,
            certFile: decryptedCert,
            keyFile: decryptedKey
        };
    });

    return validCertsDecrypted;
}

export async function getValidCertificatesForDomainsHybrid(
    domains: Set<string>
): Promise<
    Array<{
        id: number;
        domain: string;
        wildcard: boolean | null;
        certFile: string | null;
        keyFile: string | null;
        expiresAt: number | null;
        updatedAt?: number | null;
    }>
> {
    return []; // stub
}
