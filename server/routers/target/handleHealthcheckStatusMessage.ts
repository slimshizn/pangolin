import { db, targets, resources, sites, targetHealthCheck } from "@server/db";
import { MessageHandler } from "../ws";
import { Newt } from "@server/db";
import { eq, and } from "drizzle-orm";
import logger from "@server/logger";
import { unknown } from "zod";

interface TargetHealthStatus {
    status: string;
    lastCheck: string;
    checkCount: number;
    lastError?: string;
    config: {
        id: string;
        hcEnabled: boolean;
        hcPath?: string;
        hcScheme?: string;
        hcMode?: string;
        hcHostname?: string;
        hcPort?: number;
        hcInterval?: number;
        hcUnhealthyInterval?: number;
        hcTimeout?: number;
        hcHeaders?: any;
        hcMethod?: string;
    };
}

interface HealthcheckStatusMessage {
    targets: Record<string, TargetHealthStatus>;
}

export const handleHealthcheckStatusMessage: MessageHandler = async (context) => {
    const { message, client: c } = context;
    const newt = c as Newt;

    logger.info("Handling healthcheck status message");

    if (!newt) {
        logger.warn("Newt not found");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Newt has no site ID");
        return;
    }

    const data = message.data as HealthcheckStatusMessage;

    if (!data.targets) {
        logger.warn("No targets data in healthcheck status message");
        return;
    }

    try {
        let successCount = 0;
        let errorCount = 0;

        // Process each target status update
        for (const [targetId, healthStatus] of Object.entries(data.targets)) {
            logger.debug(`Processing health status for target ${targetId}: ${healthStatus.status}${healthStatus.lastError ? ` (${healthStatus.lastError})` : ''}`);

            // Verify the target belongs to this newt's site before updating
            // This prevents unauthorized updates to targets from other sites
            const targetIdNum = parseInt(targetId);
            if (isNaN(targetIdNum)) {
                logger.warn(`Invalid target ID: ${targetId}`);
                errorCount++;
                continue;
            }

            const [targetCheck] = await db
                .select({
                    targetId: targets.targetId,
                    siteId: targets.siteId
                })
                .from(targets)
                .innerJoin(resources, eq(targets.resourceId, resources.resourceId))
                .innerJoin(sites, eq(targets.siteId, sites.siteId))
                .where(
                    and(
                        eq(targets.targetId, targetIdNum),
                        eq(sites.siteId, newt.siteId)
                    )
                )
                .limit(1);

            if (!targetCheck) {
                logger.warn(`Target ${targetId} not found or does not belong to site ${newt.siteId}`);
                errorCount++;
                continue;
            }

            // Update the target's health status in the database
            await db
                .update(targetHealthCheck)
                .set({
                    hcHealth: healthStatus.status
                })
                .where(eq(targetHealthCheck.targetId, targetIdNum))
                .execute();

            logger.debug(`Updated health status for target ${targetId} to ${healthStatus.status}`);
            successCount++;
        }

        logger.debug(`Health status update complete: ${successCount} successful, ${errorCount} errors out of ${Object.keys(data.targets).length} targets`);
    } catch (error) {
        logger.error("Error processing healthcheck status message:", error);
    }

    return;
};
