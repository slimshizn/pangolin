import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { db, UserOrg } from "@server/db";
import { and, eq } from "drizzle-orm";
import { idp, idpOidcConfig, roles, userOrgs, users } from "@server/db";
import { generateId } from "@server/auth/sessions/app";
import { usageService } from "@server/lib/private/billing/usageService";
import { FeatureId } from "@server/lib/private/billing";
import { build } from "@server/build";
import { getOrgTierData } from "@server/routers/private/billing";
import { TierId } from "@server/lib/private/billing/tiers";

const paramsSchema = z
    .object({
        orgId: z.string().nonempty()
    })
    .strict();

const bodySchema = z
    .object({
        email: z
            .string()
            .toLowerCase()
            .optional()
            .refine((data) => {
                if (data) {
                    return z.string().email().safeParse(data).success;
                }
                return true;
            }),
        username: z.string().nonempty().toLowerCase(),
        name: z.string().optional(),
        type: z.enum(["internal", "oidc"]).optional(),
        idpId: z.number().optional(),
        roleId: z.number()
    })
    .strict();

export type CreateOrgUserResponse = {};

registry.registerPath({
    method: "put",
    path: "/org/{orgId}/user",
    description: "Create an organization user.",
    tags: [OpenAPITags.User, OpenAPITags.Org],
    request: {
        params: paramsSchema,
        body: {
            content: {
                "application/json": {
                    schema: bodySchema
                }
            }
        }
    },
    responses: {}
});

export async function createOrgUser(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { orgId } = parsedParams.data;
        const {
            username,
            email,
            name,
            type,
            idpId,
            roleId
        } = parsedBody.data;

        if (build == "saas") {
            const usage = await usageService.getUsage(orgId, FeatureId.USERS);
            if (!usage) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        "No usage data found for this organization"
                    )
                );
            }
            const rejectUsers = await usageService.checkLimitSet(
                orgId,
                false,
                FeatureId.USERS,
                {
                    ...usage,
                    instantaneousValue: (usage.instantaneousValue || 0) + 1
                } // We need to add one to know if we are violating the limit
            );
            if (rejectUsers) {
                return next(
                    createHttpError(
                        HttpCode.FORBIDDEN,
                        "User limit exceeded. Please upgrade your plan."
                    )
                );
            }
        }

        const [role] = await db
            .select()
            .from(roles)
            .where(eq(roles.roleId, roleId));

        if (!role) {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "Role ID not found")
            );
        }

        if (type === "internal") {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Internal users are not supported yet"
                )
            );
        } else if (type === "oidc") {
            if (build === "saas") {
                const { tier } = await getOrgTierData(orgId);
                const subscribed = tier === TierId.STANDARD;
                if (!subscribed) {
                    return next(
                        createHttpError(
                            HttpCode.FORBIDDEN,
                            "This organization's current plan does not support this feature."
                        )
                    );
                }
            }

            if (!idpId) {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "IDP ID is required for OIDC users"
                    )
                );
            }

            const [idpRes] = await db
                .select()
                .from(idp)
                .innerJoin(idpOidcConfig, eq(idp.idpId, idpOidcConfig.idpId))
                .where(eq(idp.idpId, idpId));

            if (!idpRes) {
                return next(
                    createHttpError(HttpCode.BAD_REQUEST, "IDP ID not found")
                );
            }

            if (idpRes.idp.type !== "oidc") {
                return next(
                    createHttpError(
                        HttpCode.BAD_REQUEST,
                        "IDP ID is not of type OIDC"
                    )
                );
            }

            let orgUsers: UserOrg[] | undefined;

            await db.transaction(async (trx) => {
                const [existingUser] = await trx
                    .select()
                    .from(users)
                    .where(
                        and(
                            eq(users.username, username),
                            eq(users.idpId, idpId)
                        )
                    );

                if (existingUser) {
                    const [existingOrgUser] = await trx
                        .select()
                        .from(userOrgs)
                        .where(
                            and(
                                eq(userOrgs.orgId, orgId),
                                eq(userOrgs.userId, existingUser.userId)
                            )
                        );

                    if (existingOrgUser) {
                        return next(
                            createHttpError(
                                HttpCode.BAD_REQUEST,
                                "User already exists in this organization"
                            )
                        );
                    }

                    await trx
                        .insert(userOrgs)
                        .values({
                            orgId,
                            userId: existingUser.userId,
                            roleId: role.roleId,
                            autoProvisioned: false
                        })
                        .returning();
                } else {
                    const userId = generateId(15);

                    const [newUser] = await trx
                        .insert(users)
                        .values({
                            userId: userId,
                            email,
                            username,
                            name,
                            type: "oidc",
                            idpId,
                            dateCreated: new Date().toISOString(),
                            emailVerified: true,
                        })
                        .returning();

                    await trx
                        .insert(userOrgs)
                        .values({
                            orgId,
                            userId: newUser.userId,
                            roleId: role.roleId,
                            autoProvisioned: false
                        })
                        .returning();
                }

                // List all of the users in the org
                orgUsers = await trx
                    .select()
                    .from(userOrgs)
                    .where(eq(userOrgs.orgId, orgId));
            });

            if (orgUsers) {
                await usageService.updateDaily(
                    orgId,
                    FeatureId.USERS,
                    orgUsers.length
                );
            }
        } else {
            return next(
                createHttpError(HttpCode.BAD_REQUEST, "User type is required")
            );
        }

        return response<CreateOrgUserResponse>(res, {
            data: {},
            success: true,
            error: false,
            message: "Org user created successfully",
            status: HttpCode.CREATED
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
