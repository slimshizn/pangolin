import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    clients,
    newts,
    olms,
    Site,
    sites,
    clientSites,
    exitNodes,
    ExitNode
} from "@server/db";
import { db } from "@server/db";
import { eq, and } from "drizzle-orm";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { validateNewtSessionToken } from "@server/auth/sessions/newt";
import { validateOlmSessionToken } from "@server/auth/sessions/olm";
import { checkExitNodeOrg } from "#dynamic/lib/exitNodes";

// Define Zod schema for request validation
const updateHolePunchSchema = z.object({
    olmId: z.string().optional(),
    newtId: z.string().optional(),
    token: z.string(),
    ip: z.string(),
    port: z.number(),
    timestamp: z.number(),
    reachableAt: z.string().optional(),
    publicKey: z.string().optional()
});

// New response type with multi-peer destination support
interface PeerDestination {
    destinationIP: string;
    destinationPort: number;
}

export async function updateHolePunch(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        // Validate request parameters
        const parsedParams = updateHolePunchSchema.safeParse(req.body);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const {
            olmId,
            newtId,
            ip,
            port,
            timestamp,
            token,
            reachableAt,
            publicKey
        } = parsedParams.data;

        let exitNode: ExitNode | undefined;
        if (publicKey) {
            // Get the exit node by public key
            [exitNode] = await db
                .select()
                .from(exitNodes)
                .where(eq(exitNodes.publicKey, publicKey));
        } else {
            // FOR BACKWARDS COMPATIBILITY IF GERBIL IS STILL =<1.1.0
            [exitNode] = await db.select().from(exitNodes).limit(1);
        }

        if (!exitNode) {
            logger.warn(`Exit node not found for publicKey: ${publicKey}`);
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Exit node not found")
            );
        }

        const destinations = await updateAndGenerateEndpointDestinations(
            olmId,
            newtId,
            ip,
            port,
            timestamp,
            token,
            exitNode
        );

        logger.debug(
            `Returning ${destinations.length} peer destinations for olmId: ${olmId} or newtId: ${newtId}: ${JSON.stringify(destinations, null, 2)}`
        );

        // Return the new multi-peer structure
        return res.status(HttpCode.OK).send({
            destinations: destinations
        });
    } catch (error) {
        // logger.error(error); // FIX THIS
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred..."
            )
        );
    }
}

export async function updateAndGenerateEndpointDestinations(
    olmId: string | undefined,
    newtId: string | undefined,
    ip: string,
    port: number,
    timestamp: number,
    token: string,
    exitNode: ExitNode,
    checkOrg = false
) {
    let currentSiteId: number | undefined;
    const destinations: PeerDestination[] = [];

    if (olmId) {
        logger.debug(
            `Got hole punch with ip: ${ip}, port: ${port} for olmId: ${olmId}`
        );

        const { session, olm: olmSession } =
            await validateOlmSessionToken(token);
        if (!session || !olmSession) {
            throw new Error("Unauthorized");
        }

        if (olmId !== olmSession.olmId) {
            logger.warn(`Olm ID mismatch: ${olmId} !== ${olmSession.olmId}`);
            throw new Error("Unauthorized");
        }

        const [olm] = await db.select().from(olms).where(eq(olms.olmId, olmId));

        if (!olm || !olm.clientId) {
            logger.warn(`Olm not found: ${olmId}`);
            throw new Error("Olm not found");
        }

        const [client] = await db
            .update(clients)
            .set({
                lastHolePunch: timestamp
            })
            .where(eq(clients.clientId, olm.clientId))
            .returning();

        if (await checkExitNodeOrg(exitNode.exitNodeId, client.orgId) && checkOrg) {
            // not allowed
            logger.warn(
                `Exit node ${exitNode.exitNodeId} is not allowed for org ${client.orgId}`
            );
            throw new Error("Exit node not allowed");
        }

        // Get sites that are on this specific exit node and connected to this client
        const sitesOnExitNode = await db
            .select({
                siteId: sites.siteId,
                subnet: sites.subnet,
                listenPort: sites.listenPort
            })
            .from(sites)
            .innerJoin(clientSites, eq(sites.siteId, clientSites.siteId))
            .where(
                and(
                    eq(sites.exitNodeId, exitNode.exitNodeId),
                    eq(clientSites.clientId, olm.clientId)
                )
            );

        // Update clientSites for each site on this exit node
        for (const site of sitesOnExitNode) {
            logger.debug(
                `Updating site ${site.siteId} on exit node ${exitNode.exitNodeId}`
            );

            await db
                .update(clientSites)
                .set({
                    endpoint: `${ip}:${port}`
                })
                .where(
                    and(
                        eq(clientSites.clientId, olm.clientId),
                        eq(clientSites.siteId, site.siteId)
                    )
                );
        }

        logger.debug(
            `Updated ${sitesOnExitNode.length} sites on exit node ${exitNode.exitNodeId}`
        );
        if (!client) {
            logger.warn(`Client not found for olm: ${olmId}`);
            throw new Error("Client not found");
        }

        // Create a list of the destinations from the sites
        for (const site of sitesOnExitNode) {
            if (site.subnet && site.listenPort) {
                destinations.push({
                    destinationIP: site.subnet.split("/")[0],
                    destinationPort: site.listenPort
                });
            }
        }
    } else if (newtId) {
        logger.debug(
            `Got hole punch with ip: ${ip}, port: ${port} for newtId: ${newtId}`
        );

        const { session, newt: newtSession } =
            await validateNewtSessionToken(token);

        if (!session || !newtSession) {
            throw new Error("Unauthorized");
        }

        if (newtId !== newtSession.newtId) {
            logger.warn(
                `Newt ID mismatch: ${newtId} !== ${newtSession.newtId}`
            );
            throw new Error("Unauthorized");
        }

        const [newt] = await db
            .select()
            .from(newts)
            .where(eq(newts.newtId, newtId));

        if (!newt || !newt.siteId) {
            logger.warn(`Newt not found: ${newtId}`);
            throw new Error("Newt not found");
        }

        const [site] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, newt.siteId))
            .limit(1);

        if (await checkExitNodeOrg(exitNode.exitNodeId, site.orgId) && checkOrg) {
            // not allowed
            logger.warn(
                `Exit node ${exitNode.exitNodeId} is not allowed for org ${site.orgId}`
            );
            throw new Error("Exit node not allowed");
        }

        currentSiteId = newt.siteId;

        // Update the current site with the new endpoint
        const [updatedSite] = await db
            .update(sites)
            .set({
                endpoint: `${ip}:${port}`,
                lastHolePunch: timestamp
            })
            .where(eq(sites.siteId, newt.siteId))
            .returning();

        if (!updatedSite || !updatedSite.subnet) {
            logger.warn(`Site not found: ${newt.siteId}`);
            throw new Error("Site not found");
        }

        // Find all clients that connect to this site
        // const sitesClientPairs = await db
        //     .select()
        //     .from(clientSites)
        //     .where(eq(clientSites.siteId, newt.siteId));

        // THE NEWT IS NOT SENDING RAW WG TO THE GERBIL SO IDK IF WE REALLY NEED THIS - REMOVING
        // Get client details for each client
        // for (const pair of sitesClientPairs) {
        //     const [client] = await db
        //         .select()
        //         .from(clients)
        //         .where(eq(clients.clientId, pair.clientId));

        //     if (client && client.endpoint) {
        //         const [host, portStr] = client.endpoint.split(':');
        //         if (host && portStr) {
        //             destinations.push({
        //                 destinationIP: host,
        //                 destinationPort: parseInt(portStr, 10)
        //             });
        //         }
        //     }
        // }

        // If this is a newt/site, also add other sites in the same org
        //     if (updatedSite.orgId) {
        //         const orgSites = await db
        //             .select()
        //             .from(sites)
        //             .where(eq(sites.orgId, updatedSite.orgId));

        //         for (const site of orgSites) {
        //             // Don't add the current site to the destinations
        //             if (site.siteId !== currentSiteId && site.subnet && site.endpoint && site.listenPort) {
        //                 const [host, portStr] = site.endpoint.split(':');
        //                 if (host && portStr) {
        //                     destinations.push({
        //                         destinationIP: host,
        //                         destinationPort: site.listenPort
        //                     });
        //                 }
        //             }
        //         }
        //     }
    }
    return destinations;
}
