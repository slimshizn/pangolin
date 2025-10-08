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

import { db, limits } from "@server/db";
import { and, eq } from "drizzle-orm";
import { LimitSet } from "./limitSet";
import { FeatureId } from "./features";

class LimitService {
    async applyLimitSetToOrg(orgId: string, limitSet: LimitSet): Promise<void> {
        const limitEntries = Object.entries(limitSet);

        // delete existing limits for the org
        await db.transaction(async (trx) => {
            await trx.delete(limits).where(eq(limits.orgId, orgId));
            for (const [featureId, entry] of limitEntries) {
                const limitId = `${orgId}-${featureId}`;
                const { value, description } = entry;
                await trx
                    .insert(limits)
                    .values({ limitId, orgId, featureId, value, description });
            }
        });
    }

    async getOrgLimit(
        orgId: string,
        featureId: FeatureId
    ): Promise<number | null> {
        const limitId = `${orgId}-${featureId}`;
        const [limit] = await db
            .select()
            .from(limits)
            .where(and(eq(limits.limitId, limitId)))
            .limit(1);

        return limit ? limit.value : null;
    }
}

export const limitsService = new LimitService();
