import logger from "@server/logger";
import { db } from "@server/db";
import { exitNodes } from "@server/db";
import { eq } from "drizzle-orm";
import { sendToExitNode } from "#dynamic/lib/exitNodes";

export async function addPeer(
    exitNodeId: number,
    peer: {
        publicKey: string;
        allowedIps: string[];
    }
) {
    logger.info(
        `Adding peer with public key ${peer.publicKey} to exit node ${exitNodeId}`
    );
    const [exitNode] = await db
        .select()
        .from(exitNodes)
        .where(eq(exitNodes.exitNodeId, exitNodeId))
        .limit(1);
    if (!exitNode) {
        throw new Error(`Exit node with ID ${exitNodeId} not found`);
    }

    return await sendToExitNode(exitNode, {
        remoteType: "remoteExitNode/peers/add",
        localPath: "/peer",
        method: "POST",
        data: peer
    });
}

export async function deletePeer(exitNodeId: number, publicKey: string) {
    logger.info(
        `Deleting peer with public key ${publicKey} from exit node ${exitNodeId}`
    );
    const [exitNode] = await db
        .select()
        .from(exitNodes)
        .where(eq(exitNodes.exitNodeId, exitNodeId))
        .limit(1);
    if (!exitNode) {
        throw new Error(`Exit node with ID ${exitNodeId} not found`);
    }

    return await sendToExitNode(exitNode, {
        remoteType: "remoteExitNode/peers/remove",
        localPath: "/peer",
        method: "DELETE",
        data: {
            publicKey: publicKey
        },
        queryParams: {
            public_key: publicKey
        }
    });
}
