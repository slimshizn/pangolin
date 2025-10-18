import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { eq } from "drizzle-orm";
import {
    domains,
    Org,
    orgDomains,
    orgs,
    roleActions,
    roles,
    userOrgs,
    users,
    actions
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import config from "@server/lib/config";
import { fromError } from "zod-validation-error";
import { defaultRoleAllowedActions } from "../role";
import { OpenAPITags, registry } from "@server/openApi";
import { isValidCIDR } from "@server/lib/validators";
import { createCustomer } from "#dynamic/lib/billing";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing";
import { build } from "@server/build";

const createOrgSchema = z
    .object({
        orgId: z.string(),
        name: z.string().min(1).max(255),
        subnet: z.string()
    })
    .strict();

registry.registerPath({
    method: "put",
    path: "/org",
    description: "Create a new organization",
    tags: [OpenAPITags.Org],
    request: {
        body: {
            content: {
                "application/json": {
                    schema: createOrgSchema
                }
            }
        }
    },
    responses: {}
});

export async function createOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // should this be in a middleware?
        if (config.getRawConfig().flags?.disable_user_create_org) {
            if (req.user && !req.user?.serverAdmin) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "Only server admins can create organizations"
                    )
                );
            }
        }

        const parsedBody = createOrgSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { orgId, name, subnet } = parsedBody.data;

        if (!isValidCIDR(subnet)) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invalid subnet format. Please provide a valid CIDR notation."
                )
            );
        }

        // TODO: for now we are making all of the orgs the same subnet
        // make sure the subnet is unique
        // const subnetExists = await db
        //     .select()
        //     .from(orgs)
        //     .where(eq(orgs.subnet, subnet))
        //     .limit(1);

        // if (subnetExists.length > 0) {
        //     return next(
        //         createHttpError(
        //             HttpCode.CONFLICT,
        //             `Subnet ${subnet} already exists`
        //         )
        //     );
        // }

        // make sure the orgId is unique
        const orgExists = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (orgExists.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `Organization with ID ${orgId} already exists`
                )
            );
        }

        let error = "";
        let org: Org | null = null;

        await db.transaction(async (trx) => {
            const allDomains = await trx
                .select()
                .from(domains)
                .where(eq(domains.configManaged, true));

            const newOrg = await trx
                .insert(orgs)
                .values({
                    orgId,
                    name,
                    subnet,
                    createdAt: new Date().toISOString()
                })
                .returning();

            if (newOrg.length === 0) {
                error = "Failed to create organization";
                trx.rollback();
                return;
            }

            org = newOrg[0];

            // Create admin role within the same transaction
            const [insertedRole] = await trx
                .insert(roles)
                .values({
                    orgId: newOrg[0].orgId,
                    isAdmin: true,
                    name: "Admin",
                    description: "Admin role with the most permissions"
                })
                .returning({ roleId: roles.roleId });

            if (!insertedRole || !insertedRole.roleId) {
                error = "Failed to create Admin role";
                trx.rollback();
                return;
            }

            const roleId = insertedRole.roleId;

            // Get all actions and create role actions
            const actionIds = await trx.select().from(actions).execute();

            if (actionIds.length > 0) {
                await trx.insert(roleActions).values(
                    actionIds.map((action) => ({
                        roleId,
                        actionId: action.actionId,
                        orgId: newOrg[0].orgId
                    }))
                );
            }

            if (allDomains.length) {
                await trx.insert(orgDomains).values(
                    allDomains.map((domain) => ({
                        orgId: newOrg[0].orgId,
                        domainId: domain.domainId
                    }))
                );
            }

            if (req.user) {
                await trx.insert(userOrgs).values({
                    userId: req.user!.userId,
                    orgId: newOrg[0].orgId,
                    roleId: roleId,
                    isOwner: true
                });
            } else {
                // if org created by root api key, set the server admin as the owner
                const [serverAdmin] = await trx
                    .select()
                    .from(users)
                    .where(eq(users.serverAdmin, true));

                if (!serverAdmin) {
                    error = "Server admin not found";
                    trx.rollback();
                    return;
                }

                await trx.insert(userOrgs).values({
                    userId: serverAdmin.userId,
                    orgId: newOrg[0].orgId,
                    roleId: roleId,
                    isOwner: true
                });
            }

            const memberRole = await trx
                .insert(roles)
                .values({
                    name: "Member",
                    description: "Members can only view resources",
                    orgId
                })
                .returning();

            await trx.insert(roleActions).values(
                defaultRoleAllowedActions.map((action) => ({
                    roleId: memberRole[0].roleId,
                    actionId: action,
                    orgId
                }))
            );
        });

        if (!org) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to create org"
                )
            );
        }

        if (error) {
            return next(createHttpError(HttpCode.INTERNAL_SERVER_ERROR, error));
        }

        if (build == "saas") {
            // make sure we have the stripe customer
            const customerId = await createCustomer(orgId, req.user?.email);
            if (customerId) {
                await usageService.updateDaily(
                    orgId,
                    FeatureId.USERS,
                    1,
                    customerId
                ); // Only 1 because we are creating the org
            }
        }

        return response(res, {
            data: org,
            success: true,
            error: false,
            message: "Organization created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
