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

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { certificates, db, domains } from "@server/db";
import { eq, and, or, like } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { registry } from "@server/openApi";

const getCertificateSchema = z
    .object({
        domainId: z.string(),
        domain: z.string().min(1).max(255),
        orgId: z.string()
    })
    .strict();

async function query(domainId: string, domain: string) {
    const [domainRecord] = await db
        .select()
        .from(domains)
        .where(eq(domains.domainId, domainId))
        .limit(1);

    if (!domainRecord) {
        throw new Error(`Domain with ID ${domainId} not found`);
    }

    let existing: any[] = [];
    if (domainRecord.type == "ns") {
        const domainLevelDown = domain.split('.').slice(1).join('.');
    
        existing = await db
            .select({
                certId: certificates.certId,
                domain: certificates.domain,
                wildcard: certificates.wildcard,
                status: certificates.status,
                expiresAt: certificates.expiresAt,
                lastRenewalAttempt: certificates.lastRenewalAttempt,
                createdAt: certificates.createdAt,
                updatedAt: certificates.updatedAt,
                errorMessage: certificates.errorMessage,
                renewalCount: certificates.renewalCount
            })
            .from(certificates)
            .where(
                and(
                    eq(certificates.domainId, domainId),
                    eq(certificates.wildcard, true), // only NS domains can have wildcard certs
                    or(
                        eq(certificates.domain, domain),
                        eq(certificates.domain, domainLevelDown), 
                    )
                )
            );
    } else {
        // For non-NS domains, we only match exact domain names
        existing = await db
            .select({
                certId: certificates.certId,
                domain: certificates.domain,
                wildcard: certificates.wildcard,
                status: certificates.status,
                expiresAt: certificates.expiresAt,
                lastRenewalAttempt: certificates.lastRenewalAttempt,
                createdAt: certificates.createdAt,
                updatedAt: certificates.updatedAt,
                errorMessage: certificates.errorMessage,
                renewalCount: certificates.renewalCount
            })
            .from(certificates)
            .where(
                and(
                    eq(certificates.domainId, domainId),
                    eq(certificates.domain, domain) // exact match for non-NS domains
                )
            );
    }

    return existing.length > 0 ? existing[0] : null;
}

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

registry.registerPath({
    method: "get",
    path: "/org/{orgId}/certificate/{domainId}/{domain}",
    description: "Get a certificate by domain.",
    tags: ["Certificate"],
    request: {
        params: z.object({
            domainId: z
                .string(),
            domain: z.string().min(1).max(255),
            orgId: z.string()
        })
    },
    responses: {}
});

export async function getCertificate(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getCertificateSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { domainId, domain } = parsedParams.data;

        const cert = await query(domainId, domain);

        if (!cert) {
            logger.warn(`Certificate not found for domain: ${domainId}`);
            return next(createHttpError(HttpCode.NOT_FOUND, "Certificate not found"));
        }

        return response<GetCertificateResponse>(res, {
            data: cert,
            success: true,
            error: false,
            message: "Certificate retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
