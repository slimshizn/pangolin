import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sites, resources, targets, exitNodes, ExitNode } from "@server/db";
import { db } from "@server/db";
import { eq, isNotNull, and } from "drizzle-orm";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import config from "@server/lib/config";
import { getUniqueExitNodeEndpointName } from "../../db/names";
import { findNextAvailableCidr } from "@server/lib/ip";
import { fromError } from "zod-validation-error";
import { getAllowedIps } from "../target/helpers";
import { proxyToRemote } from "@server/lib/remoteProxy";
import { getNextAvailableSubnet } from "@server/lib/exitNodes";
import { createExitNode } from "./privateCreateExitNode";

// Define Zod schema for request validation
const getConfigSchema = z.object({
    publicKey: z.string(),
    reachableAt: z.string().optional()
});

export type GetConfigResponse = {
    listenPort: number;
    ipAddress: string;
    peers: {
        publicKey: string | null;
        allowedIps: string[];
    }[];
};

export async function getConfig(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // Validate request parameters
        const parsedParams = getConfigSchema.safeParse(req.body);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { publicKey, reachableAt } = parsedParams.data;

        if (!publicKey) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "publicKey is required")
            );
        }

        const exitNode = await createExitNode(publicKey, reachableAt);

        if (!exitNode) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to create exit node"
                )
            );
        }

        // STOP HERE IN HYBRID MODE
        if (config.isManagedMode()) {
            req.body = {
                ...req.body,
                endpoint: exitNode.endpoint,
                listenPort: exitNode.listenPort
            };
            return proxyToRemote(req, res, next, "hybrid/gerbil/get-config");
        }

        const configResponse = await generateGerbilConfig(exitNode);

        logger.debug("Sending config: ", configResponse);

        return res.status(HttpCode.OK).send(configResponse);
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred..."
            )
        );
    }
}

export async function generateGerbilConfig(exitNode: ExitNode) {
    const sitesRes = await db
        .select()
        .from(sites)
        .where(
            and(
                eq(sites.exitNodeId, exitNode.exitNodeId),
                isNotNull(sites.pubKey),
                isNotNull(sites.subnet)
            )
        );

    const peers = await Promise.all(
        sitesRes.map(async (site) => {
            if (site.type === "wireguard") {
                return {
                    publicKey: site.pubKey,
                    allowedIps: await getAllowedIps(site.siteId)
                };
            } else if (site.type === "newt") {
                return {
                    publicKey: site.pubKey,
                    allowedIps: [site.subnet!]
                };
            }
            return {
                publicKey: null,
                allowedIps: []
            };
        })
    );

    const configResponse: GetConfigResponse = {
        listenPort: exitNode.listenPort || 51820,
        ipAddress: exitNode.address,
        peers
    };

    return configResponse;
}

async function getNextAvailablePort(): Promise<number> {
    // Get all existing ports from exitNodes table
    const existingPorts = await db
        .select({
            listenPort: exitNodes.listenPort
        })
        .from(exitNodes);

    // Find the first available port between 1024 and 65535
    let nextPort = config.getRawConfig().gerbil.start_port;
    for (const port of existingPorts) {
        if (port.listenPort > nextPort) {
            break;
        }
        nextPort++;
        if (nextPort > 65535) {
            throw new Error("No available ports remaining in space");
        }
    }

    return nextPort;
}
