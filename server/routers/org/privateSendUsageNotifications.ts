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
import { db } from "@server/db";
import { userOrgs, users, roles, orgs } from "@server/db";
import { eq, and, or } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { sendEmail } from "@server/emails";
import NotifyUsageLimitApproaching from "@server/emails/templates/PrivateNotifyUsageLimitApproaching";
import NotifyUsageLimitReached from "@server/emails/templates/PrivateNotifyUsageLimitReached";
import config from "@server/lib/config";
import { OpenAPITags, registry } from "@server/openApi";

const sendUsageNotificationParamsSchema = z.object({
    orgId: z.string()
});

const sendUsageNotificationBodySchema = z.object({
    notificationType: z.enum(["approaching_70", "approaching_90", "reached"]),
    limitName: z.string(),
    currentUsage: z.number(),
    usageLimit: z.number(),
});

type SendUsageNotificationRequest = z.infer<typeof sendUsageNotificationBodySchema>;

export type SendUsageNotificationResponse = {
    success: boolean;
    emailsSent: number;
    adminEmails: string[];
};

// WE SHOULD NOT REGISTER THE PATH IN SAAS
// registry.registerPath({
//     method: "post",
//     path: "/org/{orgId}/send-usage-notification",
//     description: "Send usage limit notification emails to all organization admins.",
//     tags: [OpenAPITags.Org],
//     request: {
//         params: sendUsageNotificationParamsSchema,
//         body: {
//             content: {
//                 "application/json": {
//                     schema: sendUsageNotificationBodySchema
//                 }
//             }
//         }
//     },
//     responses: {
//         200: {
//             description: "Usage notifications sent successfully",
//             content: {
//                 "application/json": {
//                     schema: z.object({
//                         success: z.boolean(),
//                         emailsSent: z.number(),
//                         adminEmails: z.array(z.string())
//                     })
//                 }
//             }
//         }
//     }
// });

async function getOrgAdmins(orgId: string) {
    // Get all users in the organization who are either:
    // 1. Organization owners (isOwner = true)
    // 2. Have admin roles (role.isAdmin = true)
    const admins = await db
        .select({
            userId: users.userId,
            email: users.email,
            name: users.name,
            isOwner: userOrgs.isOwner,
            roleName: roles.name,
            isAdminRole: roles.isAdmin
        })
        .from(userOrgs)
        .innerJoin(users, eq(userOrgs.userId, users.userId))
        .leftJoin(roles, eq(userOrgs.roleId, roles.roleId))
        .where(
            and(
                eq(userOrgs.orgId, orgId),
                or(
                    eq(userOrgs.isOwner, true),
                    eq(roles.isAdmin, true)
                )
            )
        );

    // Filter to only include users with verified emails
    const orgAdmins = admins.filter(admin => 
        admin.email && 
        admin.email.length > 0
    );

    return orgAdmins;
}

export async function sendUsageNotification(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = sendUsageNotificationParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = sendUsageNotificationBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;
        const { 
            notificationType, 
            limitName, 
            currentUsage, 
            usageLimit, 
        } = parsedBody.data;

        // Verify organization exists
        const org = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (org.length === 0) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Organization not found")
            );
        }

        // Get all admin users for this organization
        const orgAdmins = await getOrgAdmins(orgId);

        if (orgAdmins.length === 0) {
            logger.warn(`No admin users found for organization ${orgId}`);
            return response<SendUsageNotificationResponse>(res, {
                data: {
                    success: true,
                    emailsSent: 0,
                    adminEmails: []
                },
                success: true,
                error: false,
                message: "No admin users found to notify",
                status: HttpCode.OK
            });
        }

        // Default billing link if not provided
        const defaultBillingLink = `${config.getRawConfig().app.dashboard_url}/${orgId}/settings/billing`;

        let emailsSent = 0;
        const adminEmails: string[] = [];

        // Send emails to all admin users
        for (const admin of orgAdmins) {
            if (!admin.email) continue;

            try {
                let template;
                let subject;

                if (notificationType === "approaching_70" || notificationType === "approaching_90") {
                    template = NotifyUsageLimitApproaching({
                        email: admin.email,
                        limitName,
                        currentUsage,
                        usageLimit,
                        billingLink: defaultBillingLink
                    });
                    subject = `Usage limit warning for ${limitName}`;
                } else {
                    template = NotifyUsageLimitReached({
                        email: admin.email,
                        limitName,
                        currentUsage,
                        usageLimit,
                        billingLink: defaultBillingLink
                    });
                    subject = `URGENT: Usage limit reached for ${limitName}`;
                }

                await sendEmail(template, {
                    to: admin.email,
                    from: config.getNoReplyEmail(),
                    subject
                });

                emailsSent++;
                adminEmails.push(admin.email);
                
                logger.info(`Usage notification sent to admin ${admin.email} for org ${orgId}`);
            } catch (emailError) {
                logger.error(`Failed to send usage notification to ${admin.email}:`, emailError);
                // Continue with other admins even if one fails
            }
        }

        return response<SendUsageNotificationResponse>(res, {
            data: {
                success: true,
                emailsSent,
                adminEmails
            },
            success: true,
            error: false,
            message: `Usage notifications sent to ${emailsSent} administrators`,
            status: HttpCode.OK
        });

    } catch (error) {
        logger.error("Error sending usage notifications:", error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "Failed to send usage notifications")
        );
    }
}
