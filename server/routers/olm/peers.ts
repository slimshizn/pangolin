import { db } from "@server/db";
import { clients, olms, newts, sites } from "@server/db";
import { eq } from "drizzle-orm";
import { sendToClient } from "#dynamic/routers/ws";
import logger from "@server/logger";

export async function addPeer(
    clientId: number,
    peer: {
        siteId: number;
        publicKey: string;
        endpoint: string;
        serverIP: string | null;
        serverPort: number | null;
        remoteSubnets: string | null; // optional, comma-separated list of subnets that this site can access
    }
) {
    const [olm] = await db
        .select()
        .from(olms)
        .where(eq(olms.clientId, clientId))
        .limit(1);
    if (!olm) {
        throw new Error(`Olm with ID ${clientId} not found`);
    }

    await sendToClient(olm.olmId, {
        type: "olm/wg/peer/add",
        data: {
            siteId: peer.siteId,
            publicKey: peer.publicKey,
            endpoint: peer.endpoint,
            serverIP: peer.serverIP,
            serverPort: peer.serverPort,
            remoteSubnets: peer.remoteSubnets // optional, comma-separated list of subnets that this site can access
        }
    });

    logger.info(`Added peer ${peer.publicKey} to olm ${olm.olmId}`);
}

export async function deletePeer(clientId: number, siteId: number, publicKey: string) {
    const [olm] = await db
        .select()
        .from(olms)
        .where(eq(olms.clientId, clientId))
        .limit(1);
    if (!olm) {
        throw new Error(`Olm with ID ${clientId} not found`);
    }

    await sendToClient(olm.olmId, {
        type: "olm/wg/peer/remove",
        data: {
            publicKey,
            siteId: siteId
        }
    });

    logger.info(`Deleted peer ${publicKey} from olm ${olm.olmId}`);
}

export async function updatePeer(
    clientId: number,
    peer: {
        siteId: number;
        publicKey: string;
        endpoint: string;
        serverIP: string | null;
        serverPort: number | null;
        remoteSubnets?: string | null; // optional, comma-separated list of subnets that
    }
) {
    const [olm] = await db
        .select()
        .from(olms)
        .where(eq(olms.clientId, clientId))
        .limit(1);
    if (!olm) {
        throw new Error(`Olm with ID ${clientId} not found`);
    }

    await sendToClient(olm.olmId, {
        type: "olm/wg/peer/update",
        data: {
            siteId: peer.siteId,
            publicKey: peer.publicKey,
            endpoint: peer.endpoint,
            serverIP: peer.serverIP,
            serverPort: peer.serverPort,
            remoteSubnets: peer.remoteSubnets
        }
    });

    logger.info(`Added peer ${peer.publicKey} to olm ${olm.olmId}`);
}
