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

import { db, exitNodes, sites } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { clients, RemoteExitNode } from "@server/db";
import { eq, lt, isNull, and, or, inArray } from "drizzle-orm";
import logger from "@server/logger";

// Track if the offline checker interval is running
let offlineCheckerInterval: NodeJS.Timeout | null = null;
const OFFLINE_CHECK_INTERVAL = 30 * 1000; // Check every 30 seconds
const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Starts the background interval that checks for clients that haven't pinged recently
 * and marks them as offline
 */
export const startRemoteExitNodeOfflineChecker = (): void => {
    if (offlineCheckerInterval) {
        return; // Already running
    }

    offlineCheckerInterval = setInterval(async () => {
        try {
            const twoMinutesAgo = Math.floor((Date.now() - OFFLINE_THRESHOLD_MS) / 1000);

            // Find clients that haven't pinged in the last 2 minutes and mark them as offline
            const newlyOfflineNodes = await db
                .update(exitNodes)
                .set({ online: false })
                .where(
                    and(
                        eq(exitNodes.online, true),
                        eq(exitNodes.type, "remoteExitNode"),
                        or(
                            lt(exitNodes.lastPing, twoMinutesAgo),
                            isNull(exitNodes.lastPing)
                        )
                    )
                ).returning();


            // Update the sites to offline if they have not pinged either
            const exitNodeIds = newlyOfflineNodes.map(node => node.exitNodeId);

            const sitesOnNode = await db
                .select()
                .from(sites)
                .where(
                    and(
                        eq(sites.online, true),
                        inArray(sites.exitNodeId, exitNodeIds)
                    )
                );
        
            // loop through the sites and process their lastBandwidthUpdate as an iso string and if its more than 1 minute old then mark the site offline
            for (const site of sitesOnNode) {
                if (!site.lastBandwidthUpdate) { 
                    continue;
                }
                const lastBandwidthUpdate = new Date(site.lastBandwidthUpdate);
                if (Date.now() - lastBandwidthUpdate.getTime() > 60 * 1000) {
                    await db
                        .update(sites)
                        .set({ online: false })
                        .where(eq(sites.siteId, site.siteId));
                }
            }

        } catch (error) {
            logger.error("Error in offline checker interval", { error });
        }
    }, OFFLINE_CHECK_INTERVAL);

    logger.info("Started offline checker interval");
};

/**
 * Stops the background interval that checks for offline clients
 */
export const stopRemoteExitNodeOfflineChecker = (): void => {
    if (offlineCheckerInterval) {
        clearInterval(offlineCheckerInterval);
        offlineCheckerInterval = null;
        logger.info("Stopped offline checker interval");
    }
};

/**
 * Handles ping messages from clients and responds with pong
 */
export const handleRemoteExitNodePingMessage: MessageHandler = async (context) => {
    const { message, client: c, sendToClient } = context;
    const remoteExitNode = c as RemoteExitNode;

    if (!remoteExitNode) {
        logger.debug("RemoteExitNode not found");
        return;
    }

    if (!remoteExitNode.exitNodeId) {
        logger.debug("RemoteExitNode has no exit node ID!"); // this can happen if the exit node is created but not adopted yet
        return;
    }

    try {
        // Update the exit node's last ping timestamp
        await db
            .update(exitNodes)
            .set({
                lastPing: Math.floor(Date.now() / 1000),
                online: true,
            })
            .where(eq(exitNodes.exitNodeId, remoteExitNode.exitNodeId));
    } catch (error) {
        logger.error("Error handling ping message", { error });
    }

    return {
        message: {
            type: "pong",
            data: {
                timestamp: new Date().toISOString(),
            }
        },
        broadcast: false,
        excludeSender: false
    };
};