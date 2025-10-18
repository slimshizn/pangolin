import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import {
    roles,
    Client,
    clients,
    roleClients,
    userClients,
    olms,
    clientSites,
    exitNodes,
    orgs,
    sites
} from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { eq, and } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import moment from "moment";
import { hashPassword } from "@server/auth/password";
import { isValidCIDR, isValidIP } from "@server/lib/validators";
import { isIpInCidr } from "@server/lib/ip";
import { OpenAPITags, registry } from "@server/openApi";
import { listExitNodes } from "#dynamic/lib/exitNodes";

const createClientParamsSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

const createClientSchema = z
    .object({
        name: z.string().min(1).max(255),
        siteIds: z.array(z.number().int().positive()),
        olmId: z.string(),
        secret: z.string(),
        subnet: z.string(),
        type: z.enum(["olm"])
    })
    .strict();

export type CreateClientBody = z.infer<typeof createClientSchema>;

export type CreateClientResponse = Client;

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/client",
    description: "Create a new client.",
    tags: [OpenAPITags.Client, OpenAPITags.Org],
    request: {
        params: createClientParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: createClientSchema
                }
            }
        }
    },
    responses: {}
});

export async function createClient(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = createClientSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { name, type, siteIds, olmId, secret, subnet } = parsedBody.data;

        const parsedParams = createClientParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        if (req.user && !req.userOrgRoleId) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "User does not have a role")
            );
        }

        if (!isValidIP(subnet)) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invalid subnet format. Please provide a valid CIDR notation."
                )
            );
        }

        const [org] = await db.select().from(orgs).where(eq(orgs.orgId, orgId));

        if (!org) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }

        if (!org.subnet) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    `Organization with ID ${orgId} has no subnet defined`
                )
            );
        }

        if (!isIpInCidr(subnet, org.subnet)) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "IP is not in the CIDR range of the subnet."
                )
            );
        }

        const updatedSubnet = `${subnet}/${org.subnet.split("/")[1]}`; // we want the block size of the whole org

        // make sure the subnet is unique
        const subnetExistsClients = await db
            .select()
            .from(clients)
            .where(
                and(eq(clients.subnet, updatedSubnet), eq(clients.orgId, orgId))
            )
            .limit(1);

        if (subnetExistsClients.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `Subnet ${updatedSubnet} already exists in clients`
                )
            );
        }

        const subnetExistsSites = await db
            .select()
            .from(sites)
            .where(
                and(eq(sites.address, updatedSubnet), eq(sites.orgId, orgId))
            )
            .limit(1);

        if (subnetExistsSites.length > 0) {
            return next(
                createHttpError(
                    HttpCode.CONFLICT,
                    `Subnet ${updatedSubnet} already exists in sites`
                )
            );
        }

        await db.transaction(async (trx) => {
            // TODO: more intelligent way to pick the exit node
            const exitNodesList = await listExitNodes(orgId);
            const randomExitNode =
                exitNodesList[Math.floor(Math.random() * exitNodesList.length)];

            const adminRole = await trx
                .select()
                .from(roles)
                .where(and(eq(roles.isAdmin, true), eq(roles.orgId, orgId)))
                .limit(1);

            if (adminRole.length === 0) {
                trx.rollback();
                return next(
                    createHttpError(HttpCode.NOT_FOUND, `Admin role not found`)
                );
            }

            const [newClient] = await trx
                .insert(clients)
                .values({
                    exitNodeId: randomExitNode.exitNodeId,
                    orgId,
                    name,
                    subnet: updatedSubnet,
                    type
                })
                .returning();

            await trx.insert(roleClients).values({
                roleId: adminRole[0].roleId,
                clientId: newClient.clientId
            });

            if (req.user && req.userOrgRoleId != adminRole[0].roleId) {
                // make sure the user can access the site
                trx.insert(userClients).values({
                    userId: req.user?.userId!,
                    clientId: newClient.clientId
                });
            }

            // Create site to client associations
            if (siteIds && siteIds.length > 0) {
                await trx.insert(clientSites).values(
                    siteIds.map((siteId) => ({
                        clientId: newClient.clientId,
                        siteId
                    }))
                );
            }

            const secretHash = await hashPassword(secret);

            await trx.insert(olms).values({
                olmId,
                secretHash,
                clientId: newClient.clientId,
                dateCreated: moment().toISOString()
            });

            return response<CreateClientResponse>(res, {
                data: newClient,
                success: true,
                error: false,
                message: "Site created successfully",
                status: HttpCode.CREATED
            });
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
