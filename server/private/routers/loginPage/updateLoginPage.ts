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
import { db, loginPage, LoginPage, loginPageOrg, resources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq, and } from "drizzle-orm";
import { validateAndConstructDomain } from "@server/lib/domainUtils";
import { subdomainSchema } from "@server/lib/schemas";
import { createCertificate } from "#private/routers/certificates/createCertificate";
import { getOrgTierData } from "#private/lib/billing";
import { TierId } from "@server/lib/billing/tiers";
import { build } from "@server/build";
import { UpdateLoginPageResponse } from "@server/routers/loginPage/types";

const paramsSchema = z
    .object({
        orgId: z.string(),
        loginPageId: z.coerce.number()
    })
    .strict();

const bodySchema = z
    .object({
        subdomain: subdomainSchema.nullable().optional(),
        domainId: z.string().optional()
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    })
    .refine(
        (data) => {
            if (data.subdomain) {
                return subdomainSchema.safeParse(data.subdomain).success;
            }
            return true;
        },
        { message: "Invalid subdomain" }
    );

export type UpdateLoginPageBody = z.infer<typeof bodySchema>;

export async function updateLoginPage(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const updateData = parsedBody.data;

        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { loginPageId, orgId } = parsedParams.data;

        if (build === "saas"){
            const { tier } = await getOrgTierData(orgId);
            const subscribed = tier === TierId.STANDARD;
            if (!subscribed) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "This organization's current plan does not support this feature."
                    )
                );
            }
        }

        const [existingLoginPage] = await db
            .select()
            .from(loginPage)
            .where(eq(loginPage.loginPageId, loginPageId));

        if (!existingLoginPage) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Login page not found")
            );
        }

        const [orgLink] = await db
            .select()
            .from(loginPageOrg)
            .where(
                and(
                    eq(loginPageOrg.orgId, orgId),
                    eq(loginPageOrg.loginPageId, loginPageId)
                )
            );

        if (!orgLink) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "Login page not found for this organization"
                )
            );
        }

        if (updateData.domainId) {
            const domainId = updateData.domainId;

            // Validate domain and construct full domain
            const domainResult = await validateAndConstructDomain(
                domainId,
                orgId,
                updateData.subdomain
            );

            if (!domainResult.success) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, domainResult.error)
                );
            }

            const { fullDomain, subdomain: finalSubdomain } = domainResult;

            logger.debug(`Full domain: ${fullDomain}`);

            if (fullDomain) {
                const [existingDomain] = await db
                    .select()
                    .from(resources)
                    .where(eq(resources.fullDomain, fullDomain));

                if (existingDomain) {
                    return next(
                        createHttpError(
                            HttpCode.CONFLICT,
                            "Resource with that domain already exists"
                        )
                    );
                }

                const [existingLoginPage] = await db
                    .select()
                    .from(loginPage)
                    .where(eq(loginPage.fullDomain, fullDomain));

                if (
                    existingLoginPage &&
                    existingLoginPage.loginPageId !== loginPageId
                ) {
                    return next(
                        createHttpError(
                            HttpCode.CONFLICT,
                            "Login page with that domain already exists"
                        )
                    );
                }

                // update the full domain if it has changed
                if (fullDomain && fullDomain !== existingLoginPage?.fullDomain) {
                    await db
                        .update(loginPage)
                        .set({ fullDomain })
                        .where(eq(loginPage.loginPageId, loginPageId));
                }

                await createCertificate(domainId, fullDomain, db);
            }

            updateData.subdomain = finalSubdomain;
        }

        const updatedLoginPage = await db
            .update(loginPage)
            .set({ ...updateData })
            .where(eq(loginPage.loginPageId, loginPageId))
            .returning();

        if (updatedLoginPage.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Login page with ID ${loginPageId} not found`
                )
            );
        }

        return response<LoginPage>(res, {
            data: updatedLoginPage[0],
            success: true,
            error: false,
            message: "Login page created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
