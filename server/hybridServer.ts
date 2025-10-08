import logger from "@server/logger";
import config from "@server/lib/config";
import { createWebSocketClient } from "./routers/ws/client";
import { addPeer, deletePeer } from "./routers/gerbil/peers";
import { db, exitNodes } from "./db";
import { TraefikConfigManager } from "./lib/traefik/TraefikConfigManager";
import { tokenManager } from "./lib/tokenManager";
import { APP_VERSION } from "./lib/consts";
import axios from "axios";

export async function createHybridClientServer() {
    logger.info("Starting hybrid client server...");

    // Start the token manager
    await tokenManager.start();

    const token = await tokenManager.getToken();

    const monitor = new TraefikConfigManager();

    await monitor.start();

    // Create client
    const client = createWebSocketClient(
        token,
        config.getRawConfig().managed!.endpoint!,
        {
            reconnectInterval: 5000,
            pingInterval: 30000,
            pingTimeout: 10000
        }
    );

    // Register message handlers
    client.registerHandler("remoteExitNode/peers/add", async (message) => {
        const { publicKey, allowedIps } = message.data;

        // TODO: we are getting the exit node twice here
        // NOTE: there should only be one gerbil registered so...
        const [exitNode] = await db.select().from(exitNodes).limit(1);
        await addPeer(exitNode.exitNodeId, {
            publicKey: publicKey,
            allowedIps: allowedIps || []
        });
    });

    client.registerHandler("remoteExitNode/peers/remove", async (message) => {
        const { publicKey } = message.data;

        // TODO: we are getting the exit node twice here
        // NOTE: there should only be one gerbil registered so...
        const [exitNode] = await db.select().from(exitNodes).limit(1);
        await deletePeer(exitNode.exitNodeId, publicKey);
    });

    // /update-proxy-mapping
    client.registerHandler("remoteExitNode/update-proxy-mapping", async (message) => {
        try {
            const [exitNode] = await db.select().from(exitNodes).limit(1);
            if (!exitNode) {
                logger.error("No exit node found for proxy mapping update");
                return;
            }

            const response = await axios.post(`${exitNode.endpoint}/update-proxy-mapping`, message.data);
            logger.info(`Successfully updated proxy mapping: ${response.status}`);
        } catch (error) {
            // pull data out of the axios error to log
            if (axios.isAxiosError(error)) {
                logger.error("Error updating proxy mapping:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error updating proxy mapping:", error);
            }
        }
    });

    // /update-destinations
    client.registerHandler("remoteExitNode/update-destinations", async (message) => {
        try {
            const [exitNode] = await db.select().from(exitNodes).limit(1);
            if (!exitNode) {
                logger.error("No exit node found for destinations update");
                return;
            }

            const response = await axios.post(`${exitNode.endpoint}/update-destinations`, message.data);
            logger.info(`Successfully updated destinations: ${response.status}`);
        } catch (error) {
            // pull data out of the axios error to log
            if (axios.isAxiosError(error)) {
                logger.error("Error updating destinations:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error updating destinations:", error);
            }
        }
    });

    client.registerHandler("remoteExitNode/traefik/reload", async (message) => {
        await monitor.HandleTraefikConfig();
    });

    // Listen to connection events
    client.on("connect", () => {
        logger.info("Connected to WebSocket server");
        client.sendMessage("remoteExitNode/register", {
            remoteExitNodeVersion: APP_VERSION
        });
    });

    client.on("disconnect", () => {
        logger.info("Disconnected from WebSocket server");
    });

    client.on("message", (message) => {
        logger.info(
            `Received message: ${message.type} ${JSON.stringify(message.data)}`
        );
    });

    // Connect to the server
    try {
        await client.connect();
        logger.info("Connection initiated");
    } catch (error) {
        logger.error("Failed to connect:", error);
    }

    // Store the ping interval stop function for cleanup if needed
    const stopPingInterval = client.sendMessageInterval(
        "remoteExitNode/ping",
        { timestamp: Date.now() / 1000 },
        60000
    ); // send every minute

    // Return client and cleanup function for potential use
    return { client, stopPingInterval };
}
