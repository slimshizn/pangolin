import { eq } from "drizzle-orm";
import { db, exitNodes } from "@server/db";
import config from "@server/lib/config";

let currentExitNodeId: number; // we really only need to look this up once per instance
export async function getCurrentExitNodeId(): Promise<number> {
    if (!currentExitNodeId) {
        if (config.getRawConfig().gerbil.exit_node_name) {
            const exitNodeName = config.getRawConfig().gerbil.exit_node_name!;
            const [exitNode] = await db
                .select({
                    exitNodeId: exitNodes.exitNodeId
                })
                .from(exitNodes)
                .where(eq(exitNodes.name, exitNodeName));
            if (exitNode) {
                currentExitNodeId = exitNode.exitNodeId;
            }
        } else {
            const [exitNode] = await db
                .select({
                    exitNodeId: exitNodes.exitNodeId
                })
                .from(exitNodes)
                .limit(1);

            if (exitNode) {
                currentExitNodeId = exitNode.exitNodeId;
            }
        }
    }
    return currentExitNodeId;
}