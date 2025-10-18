import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Client, db, exitNodes, sites } from "@server/db";
import { clients, clientSites } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { eq, and } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import {
    addPeer as newtAddPeer,
    deletePeer as newtDeletePeer
} from "../newt/peers";
import {
    addPeer as olmAddPeer,
    deletePeer as olmDeletePeer
} from "../olm/peers";
import { sendToExitNode } from "#dynamic/lib/exitNodes";

const updateClientParamsSchema = z
    .object({
        clientId: z.string().transform(Number).pipe(z.number().int().positive())
    })
    .strict();

const updateClientSchema = z
    .object({
        name: z.string().min(1).max(255).optional(),
        siteIds: z
            .array(z.number().int().positive())
            .optional()
    })
    .strict();

export type UpdateClientBody = z.infer<typeof updateClientSchema>;

registry.registerPath({
    method: "post",
    path: "/client/{clientId}",
    description: "Update a client by its client ID.",
    tags: [OpenAPITags.Client],
    request: {
        params: updateClientParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateClientSchema
                }
            }
        }
    },
    responses: {}
});

interface PeerDestination {
    destinationIP: string;
    destinationPort: number;
}

export async function updateClient(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = updateClientSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { name, siteIds } = parsedBody.data;

        const parsedParams = updateClientParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { clientId } = parsedParams.data;

        // Fetch the client to make sure it exists and the user has access to it
        const [client] = await db
            .select()
            .from(clients)
            .where(eq(clients.clientId, clientId))
            .limit(1);

        if (!client) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Client with ID ${clientId} not found`
                )
            );
        }

        let sitesAdded = [];
        let sitesRemoved = [];

        // Fetch existing site associations
        const existingSites = await db
            .select({ siteId: clientSites.siteId })
            .from(clientSites)
            .where(eq(clientSites.clientId, clientId));

        const existingSiteIds = existingSites.map((site) => site.siteId);

        const siteIdsToProcess = siteIds || [];
        // Determine which sites were added and removed
        sitesAdded = siteIdsToProcess.filter(
            (siteId) => !existingSiteIds.includes(siteId)
        );
        sitesRemoved = existingSiteIds.filter(
            (siteId) => !siteIdsToProcess.includes(siteId)
        );

        let updatedClient: Client | undefined = undefined;
        let sitesData: any; // TODO: define type somehow from the query below
        await db.transaction(async (trx) => {
            // Update client name if provided
            if (name) {
                await trx
                    .update(clients)
                    .set({ name })
                    .where(eq(clients.clientId, clientId));
            }

            // Update site associations if provided
            // Remove sites that are no longer associated
            for (const siteId of sitesRemoved) {
                await trx
                    .delete(clientSites)
                    .where(
                        and(
                            eq(clientSites.clientId, clientId),
                            eq(clientSites.siteId, siteId)
                        )
                    );
            }

            // Add new site associations
            for (const siteId of sitesAdded) {
                await trx.insert(clientSites).values({
                    clientId,
                    siteId
                });
            }

            // Fetch the updated client
            [updatedClient] = await trx
                .select()
                .from(clients)
                .where(eq(clients.clientId, clientId))
                .limit(1);

            // get all sites for this client and join with exit nodes with site.exitNodeId
            sitesData = await trx
                .select()
                .from(sites)
                .innerJoin(clientSites, eq(sites.siteId, clientSites.siteId))
                .leftJoin(exitNodes, eq(sites.exitNodeId, exitNodes.exitNodeId))
                .where(eq(clientSites.clientId, client.clientId));
        });

        logger.info(
            `Adding ${sitesAdded.length} new sites to client ${client.clientId}`
        );
        for (const siteId of sitesAdded) {
            if (!client.subnet || !client.pubKey) {
                logger.debug("Client subnet, pubKey or endpoint is not set");
                continue;
            }

            // TODO: WE NEED TO HANDLE THIS BETTER. WE ARE DEFAULTING TO RELAYING FOR NEW SITES
            // BUT REALLY WE NEED TO TRACK THE USERS PREFERENCE THAT THEY CHOSE IN THE CLIENTS
            // AND TRIGGER A HOLEPUNCH OR SOMETHING TO GET THE ENDPOINT AND HP TO THE NEW SITES
            const isRelayed = true;

            const site = await newtAddPeer(siteId, {
                publicKey: client.pubKey,
                allowedIps: [`${client.subnet.split("/")[0]}/32`], // we want to only allow from that client
                // endpoint: isRelayed ? "" : clientSite.endpoint
                endpoint: isRelayed ? "" : "" // we are not HPing yet so no endpoint
            });

            if (!site) {
                logger.debug("Failed to add peer to newt - missing site");
                continue;
            }

            if (!site.endpoint || !site.publicKey) {
                logger.debug("Site endpoint or publicKey is not set");
                continue;
            }

            let endpoint;

            if (isRelayed) {
                if (!site.exitNodeId) {
                    logger.warn(
                        `Site ${site.siteId} has no exit node, skipping`
                    );
                    return null;
                }

                // get the exit node for the site
                const [exitNode] = await db
                    .select()
                    .from(exitNodes)
                    .where(eq(exitNodes.exitNodeId, site.exitNodeId))
                    .limit(1);

                if (!exitNode) {
                    logger.warn(`Exit node not found for site ${site.siteId}`);
                    return null;
                }

                endpoint = `${exitNode.endpoint}:21820`;
            } else {
                if (!site.endpoint) {
                    logger.warn(
                        `Site ${site.siteId} has no endpoint, skipping`
                    );
                    return null;
                }
                endpoint = site.endpoint;
            }

            await olmAddPeer(client.clientId, {
                siteId: site.siteId,
                endpoint: endpoint,
                publicKey: site.publicKey,
                serverIP: site.address,
                serverPort: site.listenPort,
                remoteSubnets: site.remoteSubnets
            });
        }

        logger.info(
            `Removing ${sitesRemoved.length} sites from client ${client.clientId}`
        );
        for (const siteId of sitesRemoved) {
            if (!client.pubKey) {
                logger.debug("Client pubKey is not set");
                continue;
            }
            const site = await newtDeletePeer(siteId, client.pubKey);
            if (!site) {
                logger.debug("Failed to delete peer from newt - missing site");
                continue;
            }
            if (!site.endpoint || !site.publicKey) {
                logger.debug("Site endpoint or publicKey is not set");
                continue;
            }
            await olmDeletePeer(client.clientId, site.siteId, site.publicKey);
        }

        if (!updatedClient || !sitesData) {
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    `Failed to update client`
                )
            );
        }

        let exitNodeDestinations: {
            reachableAt: string;
            exitNodeId: number;
            type: string;
            name: string;
            sourceIp: string;
            sourcePort: number;
            destinations: PeerDestination[];
        }[] = [];

        for (const site of sitesData) {
            if (!site.sites.subnet) {
                logger.warn(
                    `Site ${site.sites.siteId} has no subnet, skipping`
                );
                continue;
            }

            if (!site.clientSites.endpoint) {
                logger.warn(
                    `Site ${site.sites.siteId} has no endpoint, skipping`
                );
                continue;
            }

            // find the destinations in the array
            let destinations = exitNodeDestinations.find(
                (d) => d.reachableAt === site.exitNodes?.reachableAt
            );

            if (!destinations) {
                destinations = {
                    reachableAt: site.exitNodes?.reachableAt || "",
                    exitNodeId: site.exitNodes?.exitNodeId || 0,
                    type: site.exitNodes?.type || "",
                    name: site.exitNodes?.name || "",
                    sourceIp: site.clientSites.endpoint.split(":")[0] || "",
                    sourcePort:
                        parseInt(site.clientSites.endpoint.split(":")[1]) || 0,
                    destinations: [
                        {
                            destinationIP: site.sites.subnet.split("/")[0],
                            destinationPort: site.sites.listenPort || 0
                        }
                    ]
                };
            } else {
                // add to the existing destinations
                destinations.destinations.push({
                    destinationIP: site.sites.subnet.split("/")[0],
                    destinationPort: site.sites.listenPort || 0
                });
            }

            // update it in the array
            exitNodeDestinations = exitNodeDestinations.filter(
                (d) => d.reachableAt !== site.exitNodes?.reachableAt
            );
            exitNodeDestinations.push(destinations);
        }

        for (const destination of exitNodeDestinations) {
            logger.info(
                `Updating destinations for exit node at ${destination.reachableAt}`
            );
            const payload = {
                sourceIp: destination.sourceIp,
                sourcePort: destination.sourcePort,
                destinations: destination.destinations
            };
            logger.info(
                `Payload for update-destinations: ${JSON.stringify(payload, null, 2)}`
            );

            // Create an ExitNode-like object for sendToExitNode
            const exitNodeForComm = {
                exitNodeId: destination.exitNodeId,
                type: destination.type,
                reachableAt: destination.reachableAt,
                name: destination.name
            } as any; // Using 'as any' since we know sendToExitNode will handle this correctly

            await sendToExitNode(exitNodeForComm, {
                remoteType: "remoteExitNode/update-destinations",
                localPath: "/update-destinations",
                method: "POST",
                data: payload
            });
        }

        return response(res, {
            data: updatedClient,
            success: true,
            error: false,
            message: "Client updated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
