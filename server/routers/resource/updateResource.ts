import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, loginPage } from "@server/db";
import {
    domains,
    Org,
    orgDomains,
    orgs,
    Resource,
    resources
} from "@server/db";
import { eq, and } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import config from "@server/lib/config";
import { tlsNameSchema } from "@server/lib/schemas";
import { subdomainSchema } from "@server/lib/schemas";
import { registry } from "@server/openApi";
import { OpenAPITags } from "@server/openApi";
import { createCertificate } from "#dynamic/routers/certificates/createCertificate";
import { validateAndConstructDomain } from "@server/lib/domainUtils";
import { validateHeaders } from "@server/lib/validators";
import { build } from "@server/build";

const updateResourceParamsSchema = z
    .object({
        resourceId: z
            .string()
            .transform(Number)
            .pipe(z.number().int().positive())
    })
    .strict();

const updateHttpResourceBodySchema = z
    .object({
        name: z.string().min(1).max(255).optional(),
        subdomain: subdomainSchema.nullable().optional(),
        ssl: z.boolean().optional(),
        sso: z.boolean().optional(),
        blockAccess: z.boolean().optional(),
        emailWhitelistEnabled: z.boolean().optional(),
        applyRules: z.boolean().optional(),
        domainId: z.string().optional(),
        enabled: z.boolean().optional(),
        stickySession: z.boolean().optional(),
        tlsServerName: z.string().nullable().optional(),
        setHostHeader: z.string().nullable().optional(),
        skipToIdpId: z.number().int().positive().nullable().optional(),
        headers: z
            .array(z.object({ name: z.string(), value: z.string() }))
            .nullable()
            .optional()
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    })
    .refine(
        (data) => {
            if (data.subdomain) {
                return subdomainSchema.safeParse(data.subdomain).success;
            }
            return true;
        },
        { message: "Invalid subdomain" }
    )
    .refine(
        (data) => {
            if (data.tlsServerName) {
                return tlsNameSchema.safeParse(data.tlsServerName).success;
            }
            return true;
        },
        {
            message:
                "Invalid TLS Server Name. Use domain name format, or save empty to remove the TLS Server Name."
        }
    )
    .refine(
        (data) => {
            if (data.setHostHeader) {
                return tlsNameSchema.safeParse(data.setHostHeader).success;
            }
            return true;
        },
        {
            message:
                "Invalid custom Host Header value. Use domain name format, or save empty to unset custom Host Header."
        }
    );

export type UpdateResourceResponse = Resource;

const updateRawResourceBodySchema = z
    .object({
        name: z.string().min(1).max(255).optional(),
        proxyPort: z.number().int().min(1).max(65535).optional(),
        stickySession: z.boolean().optional(),
        enabled: z.boolean().optional()
        // enableProxy: z.boolean().optional() // always true now
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    })
    .refine(
        (data) => {
            if (!config.getRawConfig().flags?.allow_raw_resources) {
                if (data.proxyPort !== undefined) {
                    return false;
                }
            }
            return true;
        },
        { message: "Cannot update proxyPort" }
    );

registry.registerPath({
    method: "post",
    path: "/resource/{resourceId}",
    description: "Update a resource.",
    tags: [OpenAPITags.Resource],
    request: {
        params: updateResourceParamsSchema,
        body: {
            content: {
                "application/json": {
                    schema: updateHttpResourceBodySchema.and(
                        updateRawResourceBodySchema
                    )
                }
            }
        }
    },
    responses: {}
});

export async function updateResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = updateResourceParamsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const [result] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .leftJoin(orgs, eq(resources.orgId, orgs.orgId));

        const resource = result.resources;
        const org = result.orgs;

        if (!resource || !org) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        if (resource.http) {
            // HANDLE UPDATING HTTP RESOURCES
            return await updateHttpResource(
                {
                    req,
                    res,
                    next
                },
                {
                    resource,
                    org
                }
            );
        } else {
            // HANDLE UPDATING RAW TCP/UDP RESOURCES
            return await updateRawResource(
                {
                    req,
                    res,
                    next
                },
                {
                    resource,
                    org
                }
            );
        }
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

async function updateHttpResource(
    route: {
        req: Request;
        res: Response;
        next: NextFunction;
    },
    meta: {
        resource: Resource;
        org: Org;
    }
) {
    const { next, req, res } = route;
    const { resource, org } = meta;

    const parsedBody = updateHttpResourceBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const updateData = parsedBody.data;

    if (updateData.domainId) {
        const domainId = updateData.domainId;

        // Validate domain and construct full domain
        const domainResult = await validateAndConstructDomain(
            domainId,
            resource.orgId,
            updateData.subdomain
        );

        if (!domainResult.success) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, domainResult.error)
            );
        }

        const { fullDomain, subdomain: finalSubdomain } = domainResult;

        logger.debug(`Full domain: ${fullDomain}`);

        if (fullDomain) {
            const [existingDomain] = await db
                .select()
                .from(resources)
                .where(eq(resources.fullDomain, fullDomain));

            if (
                existingDomain &&
                existingDomain.resourceId !== resource.resourceId
            ) {
                return next(
                    createHttpError(
                        HttpCode.CONFLICT,
                        "Resource with that domain already exists"
                    )
                );
            }

            if (build != "oss") {
                const existingLoginPages = await db
                    .select()
                    .from(loginPage)
                    .where(eq(loginPage.fullDomain, fullDomain));

                if (existingLoginPages.length > 0) {
                    return next(
                        createHttpError(
                            HttpCode.CONFLICT,
                            "Login page with that domain already exists"
                        )
                    );
                }
            }
        }

        // update the full domain if it has changed
        if (fullDomain && fullDomain !== resource.fullDomain) {
            await db
                .update(resources)
                .set({ fullDomain })
                .where(eq(resources.resourceId, resource.resourceId));
        }

        // Update the subdomain in the update data
        updateData.subdomain = finalSubdomain;

        if (build != "oss") {
            await createCertificate(domainId, fullDomain, db);
        }
    }

    let headers = null;
    if (updateData.headers) {
        headers = JSON.stringify(updateData.headers);
    }

    const updatedResource = await db
        .update(resources)
        .set({ ...updateData, headers })
        .where(eq(resources.resourceId, resource.resourceId))
        .returning();

    if (updatedResource.length === 0) {
        return next(
            createHttpError(
                HttpCode.NOT_FOUND,
                `Resource with ID ${resource.resourceId} not found`
            )
        );
    }

    return response(res, {
        data: updatedResource[0],
        success: true,
        error: false,
        message: "HTTP resource updated successfully",
        status: HttpCode.OK
    });
}

async function updateRawResource(
    route: {
        req: Request;
        res: Response;
        next: NextFunction;
    },
    meta: {
        resource: Resource;
        org: Org;
    }
) {
    const { next, req, res } = route;
    const { resource } = meta;

    const parsedBody = updateRawResourceBodySchema.safeParse(req.body);
    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const updateData = parsedBody.data;

    const updatedResource = await db
        .update(resources)
        .set(updateData)
        .where(eq(resources.resourceId, resource.resourceId))
        .returning();

    if (updatedResource.length === 0) {
        return next(
            createHttpError(
                HttpCode.NOT_FOUND,
                `Resource with ID ${resource.resourceId} not found`
            )
        );
    }

    return response(res, {
        data: updatedResource[0],
        success: true,
        error: false,
        message: "Non-http Resource updated successfully",
        status: HttpCode.OK
    });
}
