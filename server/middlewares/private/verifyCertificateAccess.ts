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
import { db, domainNamespaces } from "@server/db";
import { certificates } from "@server/db";
import { domains, orgDomains } from "@server/db";
import { eq, and } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import logger from "@server/logger";

export async function verifyCertificateAccess(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        // Assume user/org access is already verified
        const orgId = req.params.orgId;
        const certId = req.params.certId || req.body?.certId || req.query?.certId;
        let domainId =
            req.params.domainId || req.body?.domainId || req.query?.domainId;

        if (!orgId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Invalid organization ID")
            );
        }

        if (!domainId) {

            if (!certId) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, "Must provide either certId or domainId")
                );
            }

            // Get the certificate and its domainId
            const [cert] = await db
                .select()
                .from(certificates)
                .where(eq(certificates.certId, Number(certId)))
                .limit(1);

            if (!cert) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Certificate with ID ${certId} not found`
                    )
                );
            }

            domainId = cert.domainId;
            if (!domainId) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Certificate with ID ${certId} does not have a domain`
                    )
                );
            }
        }

        if (!domainId) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Must provide either certId or domainId")
            );
        }

        // Check if the domain is a namespace domain
        const [namespaceDomain] = await db
            .select()
            .from(domainNamespaces)
            .where(eq(domainNamespaces.domainId, domainId))
            .limit(1);

        if (namespaceDomain) {
            // If it's a namespace domain, we can skip the org check
            return next();
        }

        // Check if the domain is associated with the org
        const [orgDomain] = await db
            .select()
            .from(orgDomains)
            .where(
                and(
                    eq(orgDomains.orgId, orgId),
                    eq(orgDomains.domainId, domainId)
                )
            )
            .limit(1);

        if (!orgDomain) {
            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "Organization does not have access to this certificate"
                )
            );
        }

        return next();
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying certificate access"
            )
        );
    }
}
export default verifyCertificateAccess;
