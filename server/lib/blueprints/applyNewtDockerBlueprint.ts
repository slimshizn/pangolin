import { sendToClient } from "#dynamic/routers/ws";
import { processContainerLabels } from "./parseDockerContainers";
import { applyBlueprint } from "./applyBlueprint";
import { db, sites } from "@server/db";
import { eq } from "drizzle-orm";
import logger from "@server/logger";

export async function applyNewtDockerBlueprint(
    siteId: number,
    newtId: string,
    containers: any
) {
    const [site] = await db
        .select()
        .from(sites)
        .where(eq(sites.siteId, siteId))
        .limit(1);

    if (!site) {
        logger.warn("Site not found in applyNewtDockerBlueprint");
        return;
    }

    // logger.debug(`Applying Docker blueprint to site: ${siteId}`);
    // logger.debug(`Containers: ${JSON.stringify(containers, null, 2)}`);

    try {
        const blueprint = processContainerLabels(containers);

        logger.debug(`Received Docker blueprint: ${JSON.stringify(blueprint)}`);

        // Update the blueprint in the database
        await applyBlueprint(site.orgId, blueprint, site.siteId);
    } catch (error) {
        logger.error(`Failed to update database from config: ${error}`);
        await sendToClient(newtId, {
            type: "newt/blueprint/results",
            data: {
                success: false,
                message: `Failed to update database from config: ${error}`
            }
        });
        return;
    }

    await sendToClient(newtId, {
        type: "newt/blueprint/results",
        data: {
            success: true,
            message: "Config updated successfully"
        }
    });
}
