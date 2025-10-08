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

import { isValidCIDR } from "@server/lib/validators";
import { getNextAvailableOrgSubnet } from "@server/lib/ip";
import {
    actions,
    apiKeyOrg,
    apiKeys,
    db,
    domains,
    Org,
    orgDomains,
    orgs,
    roleActions,
    roles,
    userOrgs
} from "@server/db";
import { eq } from "drizzle-orm";
import { defaultRoleAllowedActions } from "@server/routers/role";
import { FeatureId, limitsService, sandboxLimitSet } from "@server/lib/private/billing";
import { createCustomer } from "@server/routers/private/billing/createCustomer";
import { usageService } from "@server/lib/private/billing/usageService";

export async function createUserAccountOrg(
    userId: string,
    userEmail: string
): Promise<{
    success: boolean;
    org?: {
        orgId: string;
        name: string;
        subnet: string;
    };
    error?: string;
}> {
    // const subnet = await getNextAvailableOrgSubnet();
    const orgId = "org_" + userId;
    const name = `${userEmail}'s Organization`;

    // if (!isValidCIDR(subnet)) {
    //     return {
    //         success: false,
    //         error: "Invalid subnet format. Please provide a valid CIDR notation."
    //     };
    // }

    // // make sure the subnet is unique
    // const subnetExists = await db
    //     .select()
    //     .from(orgs)
    //     .where(eq(orgs.subnet, subnet))
    //     .limit(1);

    // if (subnetExists.length > 0) {
    //     return { success: false, error: `Subnet ${subnet} already exists` };
    // }

    // make sure the orgId is unique
    const orgExists = await db
        .select()
        .from(orgs)
        .where(eq(orgs.orgId, orgId))
        .limit(1);

    if (orgExists.length > 0) {
        return {
            success: false,
            error: `Organization with ID ${orgId} already exists`
        };
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
                // subnet
                subnet: "100.90.128.0/24", // TODO: this should not be hardcoded - or can it be the same in all orgs?
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

        await trx.insert(userOrgs).values({
            userId,
            orgId: newOrg[0].orgId,
            roleId: roleId,
            isOwner: true
        });

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

    await limitsService.applyLimitSetToOrg(orgId, sandboxLimitSet);

    if (!org) {
        return { success: false, error: "Failed to create org" };
    }

    if (error) {
        return {
            success: false,
            error: `Failed to create org: ${error}`
        };
    }

    // make sure we have the stripe customer
    const customerId = await createCustomer(orgId, userEmail);

    if (customerId) {
        await usageService.updateDaily(orgId, FeatureId.USERS, 1, customerId); // Only 1 because we are crating the org
    }

    return {
        org: {
            orgId,
            name,
            // subnet
            subnet: "100.90.128.0/24"
        },
        success: true
    };
}
