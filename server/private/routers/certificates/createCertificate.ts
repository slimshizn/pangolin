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

import { Certificate, certificates, db, domains } from "@server/db";
import logger from "@server/logger";
import { Transaction } from "@server/db";
import { eq, or, and, like } from "drizzle-orm";
import privateConfig from "#private/lib/config";

/**
 * Checks if a certificate exists for the given domain.
 * If not, creates a new certificate in 'pending' state.
 * Wildcard certs cover subdomains.
 */
export async function createCertificate(
    domainId: string,
    domain: string,
    trx: Transaction | typeof db
) {
    if (!privateConfig.getRawPrivateConfig().flags.use_pangolin_dns) {
        return;
    }

    const [domainRecord] = await trx
        .select()
        .from(domains)
        .where(eq(domains.domainId, domainId))
        .limit(1);

    if (!domainRecord) {
        throw new Error(`Domain with ID ${domainId} not found`);
    }

    let existing: Certificate[] = [];
    if (domainRecord.type == "ns") {
        const domainLevelDown = domain.split(".").slice(1).join(".");
        existing = await trx
            .select()
            .from(certificates)
            .where(
                and(
                    eq(certificates.domainId, domainId),
                    eq(certificates.wildcard, true), // only NS domains can have wildcard certs
                    or(
                        eq(certificates.domain, domain),
                        eq(certificates.domain, domainLevelDown)
                    )
                )
            );
    } else {
        // For non-NS domains, we only match exact domain names
        existing = await trx
            .select()
            .from(certificates)
            .where(
                and(
                    eq(certificates.domainId, domainId),
                    eq(certificates.domain, domain) // exact match for non-NS domains
                )
            );
    }

    if (existing.length > 0) {
        logger.info(`Certificate already exists for domain ${domain}`);
        return;
    }

    // No cert found, create a new one in pending state
    await trx.insert(certificates).values({
        domain,
        domainId,
        wildcard: domainRecord.type == "ns", // we can only create wildcard certs for NS domains
        status: "pending",
        updatedAt: Math.floor(Date.now() / 1000),
        createdAt: Math.floor(Date.now() / 1000)
    });
}
