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

import { NextFunction, Request, Response } from "express";
import {
    account,
    db,
    domainNamespaces,
    domains,
    exitNodes,
    newts,
    newtSessions,
    orgs,
    passwordResetTokens,
    Resource,
    resourcePassword,
    resourcePincode,
    resources,
    resourceWhitelist,
    roleResources,
    roles,
    roleSites,
    sites,
    targetHealthCheck,
    targets,
    userResources,
    userSites
} from "@server/db";
import HttpCode from "@server/types/HttpCode";
import { z } from "zod";
import { users } from "@server/db";
import { fromError } from "zod-validation-error";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { SqliteError } from "better-sqlite3";
import { eq, and, sql } from "drizzle-orm";
import moment from "moment";
import { generateId } from "@server/auth/sessions/app";
import config from "@server/lib/config";
import logger from "@server/logger";
import { hashPassword } from "@server/auth/password";
import { UserType } from "@server/types/UserTypes";
import { createUserAccountOrg } from "@server/lib/createUserAccountOrg";
import { sendEmail } from "@server/emails";
import WelcomeQuickStart from "@server/emails/templates/WelcomeQuickStart";
import { alphabet, generateRandomString } from "oslo/crypto";
import { createDate, TimeSpan } from "oslo";
import { getUniqueResourceName, getUniqueSiteName } from "@server/db/names";
import { pickPort } from "@server/routers/target/helpers";
import { addTargets } from "@server/routers/newt/targets";
import { isTargetValid } from "@server/lib/validators";
import { listExitNodes } from "#private/lib/exitNodes";

const bodySchema = z.object({
    email: z.string().toLowerCase().email(),
    ip: z.string().refine(isTargetValid),
    method: z.enum(["http", "https"]),
    port: z.number().int().min(1).max(65535),
    pincode: z
        .string()
        .regex(/^\d{6}$/)
        .optional(),
    password: z.string().min(4).max(100).optional(),
    enableWhitelist: z.boolean().optional().default(true),
    animalId: z.string() // This is actually the secret key for the backend
});

export type QuickStartBody = z.infer<typeof bodySchema>;

export type QuickStartResponse = {
    newtId: string;
    newtSecret: string;
    resourceUrl: string;
    completeSignUpLink: string;
};

const DEMO_UBO_KEY = "b460293f-347c-4b30-837d-4e06a04d5a22";

export async function quickStart(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedBody = bodySchema.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const {
        email,
        ip,
        method,
        port,
        pincode,
        password,
        enableWhitelist,
        animalId
    } = parsedBody.data;

    try {
        const tokenValidation = validateTokenOnApi(animalId);

        if (!tokenValidation.isValid) {
            logger.warn(
                `Quick start failed for ${email} token ${animalId}: ${tokenValidation.message}`
            );
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invalid or expired token"
                )
            );
        }

        if (animalId === DEMO_UBO_KEY) {
            if (email !== "mehrdad@getubo.com") {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "Invalid email for demo Ubo key"
                    )
                );
            }

            const [existing] = await db
                .select()
                .from(users)
                .where(
                    and(
                        eq(users.email, email),
                        eq(users.type, UserType.Internal)
                    )
                );

            if (existing) {
                // delete the user if it already exists
                await db.delete(users).where(eq(users.userId, existing.userId));
                const orgId = `org_${existing.userId}`;
                await db.delete(orgs).where(eq(orgs.orgId, orgId));
            }
        }

        const tempPassword = generateId(15);
        const passwordHash = await hashPassword(tempPassword);
        const userId = generateId(15);

        // TODO: see if that user already exists?

        // Create the sandbox user
        const existing = await db
            .select()
            .from(users)
            .where(
                and(eq(users.email, email), eq(users.type, UserType.Internal))
            );

        if (existing && existing.length > 0) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "A user with that email address already exists"
                )
            );
        }

        let newtId: string;
        let secret: string;
        let fullDomain: string;
        let resource: Resource;
        let completeSignUpLink: string;

        await db.transaction(async (trx) => {
            await trx.insert(users).values({
                userId: userId,
                type: UserType.Internal,
                username: email,
                email: email,
                passwordHash,
                dateCreated: moment().toISOString()
            });

            // create user"s account
            await trx.insert(account).values({
                userId
            });
        });

        const { success, error, org } = await createUserAccountOrg(
            userId,
            email
        );
        if (!success) {
            if (error) {
                throw new Error(error);
            }
            throw new Error("Failed to create user account and organization");
        }
        if (!org) {
            throw new Error("Failed to create user account and organization");
        }

        const orgId = org.orgId;

        await db.transaction(async (trx) => {
            const token = generateRandomString(
                8,
                alphabet("0-9", "A-Z", "a-z")
            );

            await trx
                .delete(passwordResetTokens)
                .where(eq(passwordResetTokens.userId, userId));

            const tokenHash = await hashPassword(token);

            await trx.insert(passwordResetTokens).values({
                userId: userId,
                email: email,
                tokenHash,
                expiresAt: createDate(new TimeSpan(7, "d")).getTime()
            });

            // // Create the sandbox newt
            // const newClientAddress = await getNextAvailableClientSubnet(orgId);
            // if (!newClientAddress) {
            //     throw new Error("No available subnet found");
            // }

            // const clientAddress = newClientAddress.split("/")[0];

            newtId = generateId(15);
            secret = generateId(48);

            // Create the sandbox site
            const siteNiceId = await getUniqueSiteName(orgId);
            const siteName = `First Site`;

            // pick a random exit node
            const exitNodesList = await listExitNodes(orgId);

            // select a random exit node
            const randomExitNode =
                exitNodesList[Math.floor(Math.random() * exitNodesList.length)];

            if (!randomExitNode) {
                throw new Error("No exit nodes available");
            }

            const [newSite] = await trx
                .insert(sites)
                .values({
                    orgId,
                    exitNodeId: randomExitNode.exitNodeId,
                    name: siteName,
                    niceId: siteNiceId,
                    // address: clientAddress,
                    type: "newt",
                    dockerSocketEnabled: true
                })
                .returning();

            const siteId = newSite.siteId;

            const adminRole = await trx
                .select()
                .from(roles)
                .where(and(eq(roles.isAdmin, true), eq(roles.orgId, orgId)))
                .limit(1);

            if (adminRole.length === 0) {
                throw new Error("Admin role not found");
            }

            await trx.insert(roleSites).values({
                roleId: adminRole[0].roleId,
                siteId: newSite.siteId
            });

            if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
                // make sure the user can access the site
                await trx.insert(userSites).values({
                    userId: req.user?.userId!,
                    siteId: newSite.siteId
                });
            }

            // add the peer to the exit node
            const secretHash = await hashPassword(secret!);

            await trx.insert(newts).values({
                newtId: newtId!,
                secretHash,
                siteId: newSite.siteId,
                dateCreated: moment().toISOString()
            });

            const [randomNamespace] = await trx
                .select()
                .from(domainNamespaces)
                .orderBy(sql`RANDOM()`)
                .limit(1);

            if (!randomNamespace) {
                throw new Error("No domain namespace available");
            }

            const [randomNamespaceDomain] = await trx
                .select()
                .from(domains)
                .where(eq(domains.domainId, randomNamespace.domainId))
                .limit(1);

            if (!randomNamespaceDomain) {
                throw new Error("No domain found for the namespace");
            }

            const resourceNiceId = await getUniqueResourceName(orgId);

            // Create sandbox resource
            const subdomain = `${resourceNiceId}-${generateId(5)}`;
            fullDomain = `${subdomain}.${randomNamespaceDomain.baseDomain}`;

            const resourceName = `First Resource`;

            const newResource = await trx
                .insert(resources)
                .values({
                    niceId: resourceNiceId,
                    fullDomain,
                    domainId: randomNamespaceDomain.domainId,
                    orgId,
                    name: resourceName,
                    subdomain,
                    http: true,
                    protocol: "tcp",
                    ssl: true,
                    sso: false,
                    emailWhitelistEnabled: enableWhitelist
                })
                .returning();

            await trx.insert(roleResources).values({
                roleId: adminRole[0].roleId,
                resourceId: newResource[0].resourceId
            });

            if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
                // make sure the user can access the resource
                await trx.insert(userResources).values({
                    userId: req.user?.userId!,
                    resourceId: newResource[0].resourceId
                });
            }

            resource = newResource[0];

            // Create the sandbox target
            const { internalPort, targetIps } = await pickPort(siteId!, trx);

            if (!internalPort) {
                throw new Error("No available internal port");
            }

            const newTarget = await trx
                .insert(targets)
                .values({
                    resourceId: resource.resourceId,
                    siteId: siteId!,
                    internalPort,
                    ip,
                    method,
                    port,
                    enabled: true
                })
                .returning();

            const newHealthcheck = await trx
                .insert(targetHealthCheck)
                .values({
                    targetId: newTarget[0].targetId,
                    hcEnabled: false
                }).returning();

            // add the new target to the targetIps array
            targetIps.push(`${ip}/32`);

            const [newt] = await trx
                .select()
                .from(newts)
                .where(eq(newts.siteId, siteId!))
                .limit(1);

            await addTargets(newt.newtId, newTarget, newHealthcheck, resource.protocol);

            // Set resource pincode if provided
            if (pincode) {
                await trx
                    .delete(resourcePincode)
                    .where(
                        eq(resourcePincode.resourceId, resource!.resourceId)
                    );

                const pincodeHash = await hashPassword(pincode);

                await trx.insert(resourcePincode).values({
                    resourceId: resource!.resourceId,
                    pincodeHash,
                    digitLength: 6
                });
            }

            // Set resource password if provided
            if (password) {
                await trx
                    .delete(resourcePassword)
                    .where(
                        eq(resourcePassword.resourceId, resource!.resourceId)
                    );

                const passwordHash = await hashPassword(password);

                await trx.insert(resourcePassword).values({
                    resourceId: resource!.resourceId,
                    passwordHash
                });
            }

            // Set resource OTP if whitelist is enabled
            if (enableWhitelist) {
                await trx.insert(resourceWhitelist).values({
                    email,
                    resourceId: resource!.resourceId
                });
            }

            completeSignUpLink = `${config.getRawConfig().app.dashboard_url}/auth/reset-password?quickstart=true&email=${email}&token=${token}`;

            // Store token for email outside transaction
            await sendEmail(
                WelcomeQuickStart({
                    username: email,
                    link: completeSignUpLink,
                    fallbackLink: `${config.getRawConfig().app.dashboard_url}/auth/reset-password?quickstart=true&email=${email}`,
                    resourceMethod: method,
                    resourceHostname: ip,
                    resourcePort: port,
                    resourceUrl: `https://${fullDomain}`,
                    cliCommand: `newt --id ${newtId} --secret ${secret}`
                }),
                {
                    to: email,
                    from: config.getNoReplyEmail(),
                    subject: `Access your Pangolin dashboard and resources`
                }
            );
        });

        return response<QuickStartResponse>(res, {
            data: {
                newtId: newtId!,
                newtSecret: secret!,
                resourceUrl: `https://${fullDomain!}`,
                completeSignUpLink: completeSignUpLink!
            },
            success: true,
            error: false,
            message: "Quick start completed successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
            if (config.getRawConfig().app.log_failed_attempts) {
                logger.info(
                    `Account already exists with that email. Email: ${email}. IP: ${req.ip}.`
                );
            }
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "A user with that email address already exists"
                )
            );
        } else {
            logger.error(e);
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to do quick start"
                )
            );
        }
    }
}

const BACKEND_SECRET_KEY = "4f9b6000-5d1a-11f0-9de7-ff2cc032f501";

/**
 * Validates a token received from the frontend.
 * @param {string} token The validation token from the request.
 * @returns {{ isValid: boolean; message: string }} An object indicating if the token is valid.
 */
const validateTokenOnApi = (
    token: string
): { isValid: boolean; message: string } => {
    if (token === DEMO_UBO_KEY) {
        // Special case for demo UBO key
        return { isValid: true, message: "Demo UBO key is valid." };
    }

    if (!token) {
        return { isValid: false, message: "Error: No token provided." };
    }

    try {
        // 1. Decode the base64 string
        const decodedB64 = atob(token);

        // 2. Reverse the character code manipulation
        const deobfuscated = decodedB64
            .split("")
            .map((char) => String.fromCharCode(char.charCodeAt(0) - 5)) // Reverse the shift
            .join("");

        // 3. Split the data to get the original secret and timestamp
        const parts = deobfuscated.split("|");
        if (parts.length !== 2) {
            throw new Error("Invalid token format.");
        }
        const receivedKey = parts[0];
        const tokenTimestamp = parseInt(parts[1], 10);

        // 4. Check if the secret key matches
        if (receivedKey !== BACKEND_SECRET_KEY) {
            return { isValid: false, message: "Invalid token: Key mismatch." };
        }

        // 5. Check if the timestamp is recent (e.g., within 30 seconds) to prevent replay attacks
        const now = Date.now();
        const timeDifference = now - tokenTimestamp;

        if (timeDifference > 30000) {
            // 30 seconds
            return { isValid: false, message: "Invalid token: Expired." };
        }

        if (timeDifference < 0) {
            // Timestamp is in the future
            return {
                isValid: false,
                message: "Invalid token: Timestamp is in the future."
            };
        }

        // If all checks pass, the token is valid
        return { isValid: true, message: "Token is valid!" };
    } catch (error) {
        // This will catch errors from atob (if not valid base64) or other issues.
        return {
            isValid: false,
            message: `Error: ${(error as Error).message}`
        };
    }
};
