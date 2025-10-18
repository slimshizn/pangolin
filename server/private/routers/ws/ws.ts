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

import { Router, Request, Response } from "express";
import { Server as HttpServer } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { Socket } from "net";
import {
    Newt,
    newts,
    NewtSession,
    olms,
    Olm,
    OlmSession,
    RemoteExitNode,
    RemoteExitNodeSession,
    remoteExitNodes
} from "@server/db";
import { eq } from "drizzle-orm";
import { db } from "@server/db";
import { validateNewtSessionToken } from "@server/auth/sessions/newt";
import { validateOlmSessionToken } from "@server/auth/sessions/olm";
import logger from "@server/logger";
import redisManager from "#private/lib/redis";
import { v4 as uuidv4 } from "uuid";
import { validateRemoteExitNodeSessionToken } from "#private/auth/sessions/remoteExitNode";
import { rateLimitService } from "#private/lib/rateLimit";
import { messageHandlers } from "@server/routers/ws/messageHandlers";
import { messageHandlers as privateMessageHandlers } from "#private/routers/ws/messageHandlers";
import { AuthenticatedWebSocket, ClientType, WSMessage, TokenPayload, WebSocketRequest, RedisMessage } from "@server/routers/ws";

// Merge public and private message handlers
Object.assign(messageHandlers, privateMessageHandlers);

const MAX_PENDING_MESSAGES = 50; // Maximum messages to queue during connection setup

// Helper function to process a single message
const processMessage = async (
    ws: AuthenticatedWebSocket,
    data: Buffer,
    clientId: string,
    clientType: ClientType
): Promise<void> => {
    try {
        const message: WSMessage = JSON.parse(data.toString());

        logger.debug(
            `Processing message from ${clientType.toUpperCase()} ID: ${clientId}, type: ${message.type}`
        );

        if (!message.type || typeof message.type !== "string") {
            throw new Error("Invalid message format: missing or invalid type");
        }

        // Check rate limiting with message type awareness
        const rateLimitResult = await rateLimitService.checkRateLimit(
            clientId,
            message.type, // Pass message type for granular limiting
            100, // max requests per window
            20, // max requests per message type per window
            60 * 1000 // window in milliseconds
        );
        if (rateLimitResult.isLimited) {
            const reason =
                rateLimitResult.reason === "global"
                    ? "too many messages"
                    : `too many '${message.type}' messages`;
            logger.debug(
                `Rate limit exceeded for ${clientType.toUpperCase()} ID: ${clientId} - ${reason}, ignoring message`
            );

            // Send rate limit error to client
            // ws.send(JSON.stringify({
            //     type: "rate_limit_error",
            //     data: {
            //         message: `Rate limit exceeded: ${reason}`,
            //         messageType: message.type,
            //         reason: rateLimitResult.reason
            //     }
            // }));
            return;
        }

        const handler = messageHandlers[message.type];
        if (!handler) {
            throw new Error(`Unsupported message type: ${message.type}`);
        }

        const response = await handler({
            message,
            senderWs: ws,
            client: ws.client,
            clientType: ws.clientType!,
            sendToClient,
            broadcastToAllExcept,
            connectedClients
        });

        if (response) {
            if (response.broadcast) {
                await broadcastToAllExcept(
                    response.message,
                    response.excludeSender ? clientId : undefined
                );
            } else if (response.targetClientId) {
                await sendToClient(response.targetClientId, response.message);
            } else {
                ws.send(JSON.stringify(response.message));
            }
        }
    } catch (error) {
        logger.error("Message handling error:", error);
        // ws.send(JSON.stringify({
        //     type: "error",
        //     data: {
        //         message: error instanceof Error ? error.message : "Unknown error occurred",
        //         originalMessage: data.toString()
        //     }
        // }));
    }
};

// Helper function to process pending messages
const processPendingMessages = async (
    ws: AuthenticatedWebSocket,
    clientId: string,
    clientType: ClientType
): Promise<void> => {
    if (!ws.pendingMessages || ws.pendingMessages.length === 0) {
        return;
    }

    logger.info(
        `Processing ${ws.pendingMessages.length} pending messages for ${clientType.toUpperCase()} ID: ${clientId}`
    );

    const jobs = [];
    for (const messageData of ws.pendingMessages) {
        jobs.push(processMessage(ws, messageData, clientId, clientType));
    }

    await Promise.all(jobs);

    ws.pendingMessages = []; // Clear pending messages to prevent reprocessing
};

const router: Router = Router();
const wss: WebSocketServer = new WebSocketServer({ noServer: true });

// Generate unique node ID for this instance
const NODE_ID = uuidv4();
const REDIS_CHANNEL = "websocket_messages";

// Client tracking map (local to this node)
const connectedClients: Map<string, AuthenticatedWebSocket[]> = new Map();

// Recovery tracking
let isRedisRecoveryInProgress = false;

// Helper to get map key
const getClientMapKey = (clientId: string) => clientId;

// Redis keys (generalized)
const getConnectionsKey = (clientId: string) => `ws:connections:${clientId}`;
const getNodeConnectionsKey = (nodeId: string, clientId: string) =>
    `ws:node:${nodeId}:${clientId}`;

// Initialize Redis subscription for cross-node messaging
const initializeRedisSubscription = async (): Promise<void> => {
    if (!redisManager.isRedisEnabled()) return;

    await redisManager.subscribe(
        REDIS_CHANNEL,
        async (channel: string, message: string) => {
            try {
                const redisMessage: RedisMessage = JSON.parse(message);

                // Ignore messages from this node
                if (redisMessage.fromNodeId === NODE_ID) return;

                if (
                    redisMessage.type === "direct" &&
                    redisMessage.targetClientId
                ) {
                    // Send to specific client on this node
                    await sendToClientLocal(
                        redisMessage.targetClientId,
                        redisMessage.message
                    );
                } else if (redisMessage.type === "broadcast") {
                    // Broadcast to all clients on this node except excluded
                    await broadcastToAllExceptLocal(
                        redisMessage.message,
                        redisMessage.excludeClientId
                    );
                }
            } catch (error) {
                logger.error("Error processing Redis message:", error);
            }
        }
    );
};

// Simple self-healing recovery function
// Each node is responsible for restoring its own connection state to Redis
// This approach is more efficient than cross-node coordination because:
// 1. Each node knows its own connections (source of truth)
// 2. No network overhead from broadcasting state between nodes  
// 3. No race conditions from simultaneous updates
// 4. Redis becomes eventually consistent as each node restores independently
// 5. Simpler logic with better fault tolerance
const recoverConnectionState = async (): Promise<void> => {
    if (isRedisRecoveryInProgress) {
        logger.debug("Redis recovery already in progress, skipping");
        return;
    }

    isRedisRecoveryInProgress = true;
    logger.info("Starting Redis connection state recovery...");

    try {
        // Each node simply restores its own local connections to Redis
        // This is the source of truth - no need for cross-node coordination
        await restoreLocalConnectionsToRedis();
        
        logger.info("Redis connection state recovery completed - restored local state");
    } catch (error) {
        logger.error("Error during Redis recovery:", error);
    } finally {
        isRedisRecoveryInProgress = false;
    }
};

const restoreLocalConnectionsToRedis = async (): Promise<void> => {
    if (!redisManager.isRedisEnabled()) return;

    logger.info("Restoring local connections to Redis...");
    let restoredCount = 0;

    try {
        // Restore all current local connections to Redis
        for (const [clientId, clients] of connectedClients.entries()) {
            const validClients = clients.filter(client => client.readyState === WebSocket.OPEN);
            
            if (validClients.length > 0) {
                // Add this node to the client's connection list
                await redisManager.sadd(getConnectionsKey(clientId), NODE_ID);

                // Store individual connection details
                for (const client of validClients) {
                    if (client.connectionId) {
                        await redisManager.hset(
                            getNodeConnectionsKey(NODE_ID, clientId),
                            client.connectionId,
                            Date.now().toString()
                        );
                    }
                }
                restoredCount++;
            }
        }

        logger.info(`Restored ${restoredCount} client connections to Redis`);
    } catch (error) {
        logger.error("Failed to restore local connections to Redis:", error);
    }
};

// Helper functions for client management
const addClient = async (
    clientType: ClientType,
    clientId: string,
    ws: AuthenticatedWebSocket
): Promise<void> => {
    // Generate unique connection ID
    const connectionId = uuidv4();
    ws.connectionId = connectionId;

    // Add to local tracking
    const mapKey = getClientMapKey(clientId);
    const existingClients = connectedClients.get(mapKey) || [];
    existingClients.push(ws);
    connectedClients.set(mapKey, existingClients);

    // Add to Redis tracking if enabled
    if (redisManager.isRedisEnabled()) {
        try {
            await redisManager.sadd(getConnectionsKey(clientId), NODE_ID);
            await redisManager.hset(
                getNodeConnectionsKey(NODE_ID, clientId),
                connectionId,
                Date.now().toString()
            );
        } catch (error) {
            logger.error("Failed to add client to Redis tracking (connection still functional locally):", error);
        }
    }

    logger.info(
        `Client added to tracking - ${clientType.toUpperCase()} ID: ${clientId}, Connection ID: ${connectionId}, Total connections: ${existingClients.length}`
    );
};

const removeClient = async (
    clientType: ClientType,
    clientId: string,
    ws: AuthenticatedWebSocket
): Promise<void> => {
    const mapKey = getClientMapKey(clientId);
    const existingClients = connectedClients.get(mapKey) || [];
    const updatedClients = existingClients.filter((client) => client !== ws);
    if (updatedClients.length === 0) {
        connectedClients.delete(mapKey);

        if (redisManager.isRedisEnabled()) {
            try {
                await redisManager.srem(getConnectionsKey(clientId), NODE_ID);
                await redisManager.del(getNodeConnectionsKey(NODE_ID, clientId));
            } catch (error) {
                logger.error("Failed to remove client from Redis tracking (cleanup will occur on recovery):", error);
            }
        }

        logger.info(
            `All connections removed for ${clientType.toUpperCase()} ID: ${clientId}`
        );
    } else {
        connectedClients.set(mapKey, updatedClients);

        if (redisManager.isRedisEnabled() && ws.connectionId) {
            try {
                await redisManager.hdel(
                    getNodeConnectionsKey(NODE_ID, clientId),
                    ws.connectionId
                );
            } catch (error) {
                logger.error("Failed to remove specific connection from Redis tracking:", error);
            }
        }

        logger.info(
            `Connection removed - ${clientType.toUpperCase()} ID: ${clientId}, Remaining connections: ${updatedClients.length}`
        );
    }
};

// Local message sending (within this node)
const sendToClientLocal = async (
    clientId: string,
    message: WSMessage
): Promise<boolean> => {
    const mapKey = getClientMapKey(clientId);
    const clients = connectedClients.get(mapKey);
    if (!clients || clients.length === 0) {
        return false;
    }
    const messageString = JSON.stringify(message);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(messageString);
        }
    });
    return true;
};

const broadcastToAllExceptLocal = async (
    message: WSMessage,
    excludeClientId?: string
): Promise<void> => {
    connectedClients.forEach((clients, mapKey) => {
        const [type, id] = mapKey.split(":");
        if (!(excludeClientId && id === excludeClientId)) {
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        }
    });
};

// Cross-node message sending (via Redis)
const sendToClient = async (
    clientId: string,
    message: WSMessage
): Promise<boolean> => {
    // Try to send locally first
    const localSent = await sendToClientLocal(clientId, message);

    // Only send via Redis if the client is not connected locally and Redis is enabled
    if (!localSent && redisManager.isRedisEnabled()) {
        try {
            const redisMessage: RedisMessage = {
                type: "direct",
                targetClientId: clientId,
                message,
                fromNodeId: NODE_ID
            };

            await redisManager.publish(REDIS_CHANNEL, JSON.stringify(redisMessage));
        } catch (error) {
            logger.error("Failed to send message via Redis, message may be lost:", error);
            // Continue execution - local delivery already attempted
        }
    } else if (!localSent && !redisManager.isRedisEnabled()) {
        // Redis is disabled or unavailable - log that we couldn't deliver to remote nodes
        logger.debug(`Could not deliver message to ${clientId} - not connected locally and Redis unavailable`);
    }

    return localSent;
};

const broadcastToAllExcept = async (
    message: WSMessage,
    excludeClientId?: string
): Promise<void> => {
    // Broadcast locally
    await broadcastToAllExceptLocal(message, excludeClientId);

    // If Redis is enabled, also broadcast via Redis pub/sub to other nodes
    if (redisManager.isRedisEnabled()) {
        try {
            const redisMessage: RedisMessage = {
                type: "broadcast",
                excludeClientId,
                message,
                fromNodeId: NODE_ID
            };

            await redisManager.publish(REDIS_CHANNEL, JSON.stringify(redisMessage));
        } catch (error) {
            logger.error("Failed to broadcast message via Redis, remote nodes may not receive it:", error);
            // Continue execution - local broadcast already completed
        }
    } else {
        logger.debug("Redis unavailable - broadcast limited to local node only");
    }
};

// Check if a client has active connections across all nodes
const hasActiveConnections = async (clientId: string): Promise<boolean> => {
    if (!redisManager.isRedisEnabled()) {
        const mapKey = getClientMapKey(clientId);
        const clients = connectedClients.get(mapKey);
        return !!(clients && clients.length > 0);
    }

    const activeNodes = await redisManager.smembers(
        getConnectionsKey(clientId)
    );
    return activeNodes.length > 0;
};

// Get all active nodes for a client
const getActiveNodes = async (
    clientType: ClientType,
    clientId: string
): Promise<string[]> => {
    if (!redisManager.isRedisEnabled()) {
        const mapKey = getClientMapKey(clientId);
        const clients = connectedClients.get(mapKey);
        return clients && clients.length > 0 ? [NODE_ID] : [];
    }

    return await redisManager.smembers(getConnectionsKey(clientId));
};

// Token verification middleware
const verifyToken = async (
    token: string,
    clientType: ClientType
): Promise<TokenPayload | null> => {
    try {
        if (clientType === "newt") {
            const { session, newt } = await validateNewtSessionToken(token);
            if (!session || !newt) {
                return null;
            }
            const existingNewt = await db
                .select()
                .from(newts)
                .where(eq(newts.newtId, newt.newtId));
            if (!existingNewt || !existingNewt[0]) {
                return null;
            }
            return { client: existingNewt[0], session, clientType };
        } else if (clientType === "olm") {
            const { session, olm } = await validateOlmSessionToken(token);
            if (!session || !olm) {
                return null;
            }
            const existingOlm = await db
                .select()
                .from(olms)
                .where(eq(olms.olmId, olm.olmId));
            if (!existingOlm || !existingOlm[0]) {
                return null;
            }
            return { client: existingOlm[0], session, clientType };
        } else if (clientType === "remoteExitNode") {
            const { session, remoteExitNode } =
                await validateRemoteExitNodeSessionToken(token);
            if (!session || !remoteExitNode) {
                return null;
            }
            const existingRemoteExitNode = await db
                .select()
                .from(remoteExitNodes)
                .where(
                    eq(
                        remoteExitNodes.remoteExitNodeId,
                        remoteExitNode.remoteExitNodeId
                    )
                );
            if (!existingRemoteExitNode || !existingRemoteExitNode[0]) {
                return null;
            }
            return { client: existingRemoteExitNode[0], session, clientType };
        }

        return null;
    } catch (error) {
        logger.error("Token verification failed:", error);
        return null;
    }
};

const setupConnection = async (
    ws: AuthenticatedWebSocket,
    client: Newt | Olm | RemoteExitNode,
    clientType: ClientType
): Promise<void> => {
    logger.info("Establishing websocket connection");
    if (!client) {
        logger.error("Connection attempt without client");
        return ws.terminate();
    }

    ws.client = client;
    ws.clientType = clientType;
    ws.isFullyConnected = false;
    ws.pendingMessages = [];

    // Get client ID first
    let clientId: string;
    if (clientType === "newt") {
        clientId = (client as Newt).newtId;
    } else if (clientType === "olm") {
        clientId = (client as Olm).olmId;
    } else if (clientType === "remoteExitNode") {
        clientId = (client as RemoteExitNode).remoteExitNodeId;
    } else {
        throw new Error(`Unknown client type: ${clientType}`);
    }

    // Set up message handler FIRST to prevent race condition
    ws.on("message", async (data) => {
        if (!ws.isFullyConnected) {
            // Queue message for later processing with limits
            ws.pendingMessages = ws.pendingMessages || [];

            if (ws.pendingMessages.length >= MAX_PENDING_MESSAGES) {
                logger.warn(
                    `Too many pending messages for ${clientType.toUpperCase()} ID: ${clientId}, dropping oldest message`
                );
                ws.pendingMessages.shift(); // Remove oldest message
            }

            logger.debug(
                `Queueing message from ${clientType.toUpperCase()} ID: ${clientId} (connection not fully established)`
            );
            ws.pendingMessages.push(data as Buffer);
            return;
        }

        await processMessage(ws, data as Buffer, clientId, clientType);
    });

    // Set up other event handlers before async operations
    ws.on("close", async () => {
        // Clear any pending messages to prevent memory leaks
        if (ws.pendingMessages) {
            ws.pendingMessages = [];
        }
        await removeClient(clientType, clientId, ws);
        logger.info(
            `Client disconnected - ${clientType.toUpperCase()} ID: ${clientId}`
        );
    });

    ws.on("error", (error: Error) => {
        logger.error(
            `WebSocket error for ${clientType.toUpperCase()} ID ${clientId}:`,
            error
        );
    });

    try {
        await addClient(clientType, clientId, ws);

        // Mark connection as fully established
        ws.isFullyConnected = true;

        logger.info(
            `WebSocket connection fully established and ready - ${clientType.toUpperCase()} ID: ${clientId}`
        );

        // Process any messages that were queued while connection was being established
        await processPendingMessages(ws, clientId, clientType);
    } catch (error) {
        logger.error(
            `Failed to fully establish connection for ${clientType.toUpperCase()} ID: ${clientId}:`,
            error
        );
        // ws.send(JSON.stringify({
        //     type: "connection_error",
        //     data: {
        //         message: "Failed to establish connection"
        //     }
        // }));
        ws.terminate();
        return;
    }
};

// Router endpoint
router.get("/ws", (req: Request, res: Response) => {
    res.status(200).send("WebSocket endpoint");
});

// WebSocket upgrade handler
const handleWSUpgrade = (server: HttpServer): void => {
    server.on(
        "upgrade",
        async (request: WebSocketRequest, socket: Socket, head: Buffer) => {
            try {
                const url = new URL(
                    request.url || "",
                    `http://${request.headers.host}`
                );
                const token =
                    url.searchParams.get("token") ||
                    request.headers["sec-websocket-protocol"] ||
                    "";
                let clientType = url.searchParams.get(
                    "clientType"
                ) as ClientType;

                if (!clientType) {
                    clientType = "newt";
                }

                if (
                    !token ||
                    !clientType ||
                    !["newt", "olm", "remoteExitNode"].includes(clientType)
                ) {
                    logger.warn(
                        "Unauthorized connection attempt: invalid token or client type..."
                    );
                    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                    socket.destroy();
                    return;
                }

                const tokenPayload = await verifyToken(token, clientType);
                if (!tokenPayload) {
                    logger.debug(
                        "Unauthorized connection attempt: invalid token..."
                    );
                    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                    socket.destroy();
                    return;
                }

                wss.handleUpgrade(
                    request,
                    socket,
                    head,
                    (ws: AuthenticatedWebSocket) => {
                        setupConnection(
                            ws,
                            tokenPayload.client,
                            tokenPayload.clientType
                        );
                    }
                );
            } catch (error) {
                logger.error("WebSocket upgrade error:", error);
                socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
                socket.destroy();
            }
        }
    );
};

// Add periodic connection state sync to handle Redis disconnections/reconnections
const startPeriodicStateSync = (): void => {
    // Lightweight sync every 5 minutes - just restore our own state
    setInterval(async () => {
        if (redisManager.isRedisEnabled() && !isRedisRecoveryInProgress) {
            try {
                await restoreLocalConnectionsToRedis();
                logger.debug("Periodic connection state sync completed");
            } catch (error) {
                logger.error("Error during periodic connection state sync:", error);
            }
        }
    }, 5 * 60 * 1000); // 5 minutes

    // Cleanup stale connections every 15 minutes
    setInterval(async () => {
        if (redisManager.isRedisEnabled()) {
            try {
                await cleanupStaleConnections();
                logger.debug("Periodic connection cleanup completed");
            } catch (error) {
                logger.error("Error during periodic connection cleanup:", error);
            }
        }
    }, 15 * 60 * 1000); // 15 minutes
};

const cleanupStaleConnections = async (): Promise<void> => {
    if (!redisManager.isRedisEnabled()) return;

    try {
        const nodeKeys = await redisManager.getClient()?.keys(`ws:node:${NODE_ID}:*`) || [];
        
        for (const nodeKey of nodeKeys) {
            const connections = await redisManager.hgetall(nodeKey);
            const clientId = nodeKey.replace(`ws:node:${NODE_ID}:`, '');
            const localClients = connectedClients.get(clientId) || [];
            const localConnectionIds = localClients
                .filter(client => client.readyState === WebSocket.OPEN)
                .map(client => client.connectionId)
                .filter(Boolean);

            // Remove Redis entries for connections that no longer exist locally
            for (const [connectionId, timestamp] of Object.entries(connections)) {
                if (!localConnectionIds.includes(connectionId)) {
                    await redisManager.hdel(nodeKey, connectionId);
                    logger.debug(`Cleaned up stale connection: ${connectionId} for client: ${clientId}`);
                }
            }

            // If no connections remain for this client, remove from Redis entirely
            const remainingConnections = await redisManager.hgetall(nodeKey);
            if (Object.keys(remainingConnections).length === 0) {
                await redisManager.srem(getConnectionsKey(clientId), NODE_ID);
                await redisManager.del(nodeKey);
                logger.debug(`Cleaned up empty connection tracking for client: ${clientId}`);
            }
        }
    } catch (error) {
        logger.error("Error cleaning up stale connections:", error);
    }
};

// Initialize Redis subscription when the module is loaded
if (redisManager.isRedisEnabled()) {
    initializeRedisSubscription().catch((error) => {
        logger.error("Failed to initialize Redis subscription:", error);
    });
    
    // Register recovery callback with Redis manager
    // When Redis reconnects, each node simply restores its own local state
    redisManager.onReconnection(async () => {
        logger.info("Redis reconnected, starting WebSocket state recovery...");
        await recoverConnectionState();
    });
    
    // Start periodic state synchronization
    startPeriodicStateSync();
    
    logger.info(
        `WebSocket handler initialized with Redis support - Node ID: ${NODE_ID}`
    );
} else {
    logger.debug(
        "WebSocket handler initialized in local mode"
    );
}

// Cleanup function for graceful shutdown
const cleanup = async (): Promise<void> => {
    try {
        // Close all WebSocket connections
        connectedClients.forEach((clients) => {
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.terminate();
                }
            });
        });

        // Clean up Redis tracking for this node
        if (redisManager.isRedisEnabled()) {
            const keys =
                (await redisManager
                    .getClient()
                    ?.keys(`ws:node:${NODE_ID}:*`)) || [];
            if (keys.length > 0) {
                await Promise.all(keys.map((key) => redisManager.del(key)));
            }
        }

        logger.info("WebSocket cleanup completed");
    } catch (error) {
        logger.error("Error during WebSocket cleanup:", error);
    }
};

export {
    router,
    handleWSUpgrade,
    sendToClient,
    broadcastToAllExcept,
    connectedClients,
    hasActiveConnections,
    getActiveNodes,
    NODE_ID,
    cleanup
};
