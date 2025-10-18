import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, domains, orgDomains, resources } from "@server/db";
import { newts, newtSessions, orgs, sites, userActions } from "@server/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { ActionsEnum, checkUserActionPermission } from "@server/auth/actions";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { sendToClient } from "#dynamic/routers/ws";
import { deletePeer } from "../gerbil/peers";
import { OpenAPITags, registry } from "@server/openApi";

const deleteOrgSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

export type DeleteOrgResponse = {};

registry.registerPath({
    method: "delete",
    path: "/org/{orgId}",
    description: "Delete an organization",
    tags: [OpenAPITags.Org],
    request: {
        params: deleteOrgSchema
    },
    responses: {}
});

export async function deleteOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteOrgSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;

        const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (!org) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Organization with ID ${orgId} not found`
                )
            );
        }
        // we need to handle deleting each site
        const orgSites = await db
            .select()
            .from(sites)
            .where(eq(sites.orgId, orgId))
            .limit(1);

        const deletedNewtIds: string[] = [];

        await db.transaction(async (trx) => {
            if (sites) {
                for (const site of orgSites) {
                    if (site.pubKey) {
                        if (site.type == "wireguard") {
                            await deletePeer(site.exitNodeId!, site.pubKey);
                        } else if (site.type == "newt") {
                            // get the newt on the site by querying the newt table for siteId
                            const [deletedNewt] = await trx
                                .delete(newts)
                                .where(eq(newts.siteId, site.siteId))
                                .returning();
                            if (deletedNewt) {
                                deletedNewtIds.push(deletedNewt.newtId);

                                // delete all of the sessions for the newt
                                await trx
                                    .delete(newtSessions)
                                    .where(
                                        eq(
                                            newtSessions.newtId,
                                            deletedNewt.newtId
                                        )
                                    );
                            }
                        }
                    }

                    logger.info(`Deleting site ${site.siteId}`);
                    await trx
                        .delete(sites)
                        .where(eq(sites.siteId, site.siteId));
                }
            }

            const allOrgDomains = await trx
                .select()
                .from(orgDomains)
                .innerJoin(domains, eq(domains.domainId, orgDomains.domainId))
                .where(
                    and(
                        eq(orgDomains.orgId, orgId),
                        eq(domains.configManaged, false)
                    )
                );

            // For each domain, check if it belongs to multiple organizations
            const domainIdsToDelete: string[] = [];
            for (const orgDomain of allOrgDomains) {
                const domainId = orgDomain.domains.domainId;

                // Count how many organizations this domain belongs to
                const orgCount = await trx
                    .select({ count: sql<number>`count(*)` })
                    .from(orgDomains)
                    .where(eq(orgDomains.domainId, domainId));

                // Only delete the domain if it belongs to exactly 1 organization (the one being deleted)
                if (orgCount[0].count === 1) {
                    domainIdsToDelete.push(domainId);
                }
            }

            // Delete domains that belong exclusively to this organization
            if (domainIdsToDelete.length > 0) {
                await trx
                    .delete(domains)
                    .where(inArray(domains.domainId, domainIdsToDelete));
            }

            // Delete resources
            await trx.delete(resources).where(eq(resources.orgId, orgId));

            await trx.delete(orgs).where(eq(orgs.orgId, orgId));
        });

        // Send termination messages outside of transaction to prevent blocking
        for (const newtId of deletedNewtIds) {
            const payload = {
                type: `newt/terminate`,
                data: {}
            };
            // Don't await this to prevent blocking the response
            sendToClient(newtId, payload).catch((error) => {
                logger.error(
                    "Failed to send termination message to newt:",
                    error
                );
            });
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Organization deleted successfully",
            status: HttpCode.OK
        });
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
