import { db } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { clients, Newt } from "@server/db";
import { eq } from "drizzle-orm";
import logger from "@server/logger";

interface PeerBandwidth {
    publicKey: string;
    bytesIn: number;
    bytesOut: number;
}

export const handleReceiveBandwidthMessage: MessageHandler = async (context) => {
    const { message, client, sendToClient } = context;

    if (!message.data.bandwidthData) {
        logger.warn("No bandwidth data provided");
    }

    const bandwidthData: PeerBandwidth[] = message.data.bandwidthData;

    if (!Array.isArray(bandwidthData)) {
        throw new Error("Invalid bandwidth data");
    }

    await db.transaction(async (trx) => {
        for (const peer of bandwidthData) {
            const { publicKey, bytesIn, bytesOut } = peer;

            // Find the client by public key
            const [client] = await trx
                .select()
                .from(clients)
                .where(eq(clients.pubKey, publicKey))
                .limit(1);

            if (!client) {
                continue;
            }

            // Update the client's bandwidth usage
            await trx
                .update(clients)
                .set({
                    megabytesOut: (client.megabytesIn || 0) + bytesIn,
                    megabytesIn: (client.megabytesOut || 0) + bytesOut,
                    lastBandwidthUpdate: new Date().toISOString(),
                })
                .where(eq(clients.clientId, client.clientId));
        }
    });
};
