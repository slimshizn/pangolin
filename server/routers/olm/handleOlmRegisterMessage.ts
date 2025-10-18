import { db, ExitNode } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { clients, clientSites, exitNodes, Olm, olms, sites } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import { addPeer, deletePeer } from "../newt/peers";
import logger from "@server/logger";
import { listExitNodes } from "#dynamic/lib/exitNodes";

export const handleOlmRegisterMessage: MessageHandler = async (context) => {
    logger.info("Handling register olm message!");
    const { message, client: c, sendToClient } = context;
    const olm = c as Olm;

    const now = new Date().getTime() / 1000;

    if (!olm) {
        logger.warn("Olm not found");
        return;
    }
    if (!olm.clientId) {
        logger.warn("Olm has no client ID!");
        return;
    }
    const clientId = olm.clientId;
    const { publicKey, relay, olmVersion } = message.data;

    logger.debug(
        `Olm client ID: ${clientId}, Public Key: ${publicKey}, Relay: ${relay}`
    );

    if (!publicKey) {
        logger.warn("Public key not provided");
        return;
    }

    // Get the client
    const [client] = await db
        .select()
        .from(clients)
        .where(eq(clients.clientId, clientId))
        .limit(1);

    if (!client) {
        logger.warn("Client not found");
        return;
    }

    if (client.exitNodeId) {
        // TODO: FOR NOW WE ARE JUST HOLEPUNCHING ALL EXIT NODES BUT IN THE FUTURE WE SHOULD HANDLE THIS BETTER

        // Get the exit node
        const allExitNodes = await listExitNodes(client.orgId, true); // FILTER THE ONLINE ONES

        const exitNodesHpData = allExitNodes.map((exitNode: ExitNode) => {
            return {
                publicKey: exitNode.publicKey,
                endpoint: exitNode.endpoint
            };
        });

        // Send holepunch message
        await sendToClient(olm.olmId, {
            type: "olm/wg/holepunch/all",
            data: {
                exitNodes: exitNodesHpData
            }
        });

        if (!olmVersion) {
            // THIS IS FOR BACKWARDS COMPATIBILITY
            // THE OLDER CLIENTS DID NOT SEND THE VERSION
            await sendToClient(olm.olmId, {
                type: "olm/wg/holepunch",
                data: {
                    serverPubKey: allExitNodes[0].publicKey,
                    endpoint: allExitNodes[0].endpoint
                }
            });
        }
    }

    if (olmVersion) {
        await db
            .update(olms)
            .set({
                version: olmVersion
            })
            .where(eq(olms.olmId, olm.olmId));
    }

    // if (now - (client.lastHolePunch || 0) > 6) {
    //     logger.warn("Client last hole punch is too old, skipping all sites");
    //     return;
    // }

    if (client.pubKey !== publicKey) {
        logger.info(
            "Public key mismatch. Updating public key and clearing session info..."
        );
        // Update the client's public key
        await db
            .update(clients)
            .set({
                pubKey: publicKey
            })
            .where(eq(clients.clientId, olm.clientId));

        // set isRelay to false for all of the client's sites to reset the connection metadata
        await db
            .update(clientSites)
            .set({
                isRelayed: relay == true
            })
            .where(eq(clientSites.clientId, olm.clientId));
    }

    // Get all sites data
    const sitesData = await db
        .select()
        .from(sites)
        .innerJoin(clientSites, eq(sites.siteId, clientSites.siteId))
        .where(eq(clientSites.clientId, client.clientId));

    // Prepare an array to store site configurations
    const siteConfigurations = [];
    logger.debug(
        `Found ${sitesData.length} sites for client ${client.clientId}`
    );

    if (sitesData.length === 0) {
        sendToClient(olm.olmId, {
            type: "olm/register/no-sites",
            data: {}
        });
    }

    // Process each site
    for (const { sites: site } of sitesData) {
        if (!site.exitNodeId) {
            logger.warn(
                `Site ${site.siteId} does not have exit node, skipping`
            );
            continue;
        }

        // Validate endpoint and hole punch status
        if (!site.endpoint) {
            logger.warn(`In olm register: site ${site.siteId} has no endpoint, skipping`);
            continue;
        }

        // if (site.lastHolePunch && now - site.lastHolePunch > 6 && relay) {
        //     logger.warn(
        //         `Site ${site.siteId} last hole punch is too old, skipping`
        //     );
        //     continue;
        // }

        // If public key changed, delete old peer from this site
        if (client.pubKey && client.pubKey != publicKey) {
            logger.info(
                `Public key mismatch. Deleting old peer from site ${site.siteId}...`
            );
            await deletePeer(site.siteId, client.pubKey!);
        }

        if (!site.subnet) {
            logger.warn(`Site ${site.siteId} has no subnet, skipping`);
            continue;
        }

        const [clientSite] = await db
            .select()
            .from(clientSites)
            .where(
                and(
                    eq(clientSites.clientId, client.clientId),
                    eq(clientSites.siteId, site.siteId)
                )
            )
            .limit(1);

        // Add the peer to the exit node for this site
        if (clientSite.endpoint) {
            logger.info(
                `Adding peer ${publicKey} to site ${site.siteId} with endpoint ${clientSite.endpoint}`
            );
            await addPeer(site.siteId, {
                publicKey: publicKey,
                allowedIps: [`${client.subnet.split("/")[0]}/32`], // we want to only allow from that client
                endpoint: relay ? "" : clientSite.endpoint
            });
        } else {
            logger.warn(
                `Client ${client.clientId} has no endpoint, skipping peer addition`
            );
        }

        let endpoint = site.endpoint;
        if (relay) {
            const [exitNode] = await db
                .select()
                .from(exitNodes)
                .where(eq(exitNodes.exitNodeId, site.exitNodeId))
                .limit(1);
            if (!exitNode) {
                logger.warn(`Exit node not found for site ${site.siteId}`);
                continue;
            }
            endpoint = `${exitNode.endpoint}:21820`;
        }

        // Add site configuration to the array
        siteConfigurations.push({
            siteId: site.siteId,
            endpoint: endpoint,
            publicKey: site.publicKey,
            serverIP: site.address,
            serverPort: site.listenPort,
            remoteSubnets: site.remoteSubnets
        });
    }

    // REMOVED THIS SO IT CREATES THE INTERFACE AND JUST WAITS FOR THE SITES
    // if (siteConfigurations.length === 0) {
    //     logger.warn("No valid site configurations found");
    //     return;
    // }

    // Return connect message with all site configurations
    return {
        message: {
            type: "olm/wg/connect",
            data: {
                sites: siteConfigurations,
                tunnelIP: client.subnet
            }
        },
        broadcast: false,
        excludeSender: false
    };
};
