import { db, loginPage, LoginPage, loginPageOrg } from "@server/db";
import {
    Resource,
    ResourcePassword,
    ResourcePincode,
    ResourceRule,
    resourcePassword,
    resourcePincode,
    resourceHeaderAuth,
    ResourceHeaderAuth,
    resourceRules,
    resources,
    roleResources,
    sessions,
    userOrgs,
    userResources,
    users
} from "@server/db";
import { and, eq } from "drizzle-orm";
import axios from "axios";
import config from "@server/lib/config";
import logger from "@server/logger";
import { tokenManager } from "@server/lib/tokenManager";

export type ResourceWithAuth = {
    resource: Resource | null;
    pincode: ResourcePincode | null;
    password: ResourcePassword | null;
    headerAuth: ResourceHeaderAuth | null;
};

export type UserSessionWithUser = {
    session: any;
    user: any;
};

/**
 * Get resource by domain with pincode and password information
 */
export async function getResourceByDomain(
    domain: string
): Promise<ResourceWithAuth | null> {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/resource/domain/${domain}`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return null;
        }
    }

    const [result] = await db
        .select()
        .from(resources)
        .leftJoin(
            resourcePincode,
            eq(resourcePincode.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourcePassword,
            eq(resourcePassword.resourceId, resources.resourceId)
        )
        .leftJoin(
            resourceHeaderAuth,
            eq(resourceHeaderAuth.resourceId, resources.resourceId)
        )
        .where(eq(resources.fullDomain, domain))
        .limit(1);

    if (!result) {
        return null;
    }

    return {
        resource: result.resources,
        pincode: result.resourcePincode,
        password: result.resourcePassword,
        headerAuth: result.resourceHeaderAuth
    };
}

/**
 * Get user session with user information
 */
export async function getUserSessionWithUser(
    userSessionId: string
): Promise<UserSessionWithUser | null> {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/session/${userSessionId}`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return null;
        }
    }

    const [res] = await db
        .select()
        .from(sessions)
        .leftJoin(users, eq(users.userId, sessions.userId))
        .where(eq(sessions.sessionId, userSessionId));

    if (!res) {
        return null;
    }

    return {
        session: res.session,
        user: res.user
    };
}

/**
 * Get user organization role
 */
export async function getUserOrgRole(userId: string, orgId: string) {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/user/${userId}/org/${orgId}/role`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return null;
        }
    }

    const userOrgRole = await db
        .select()
        .from(userOrgs)
        .where(and(eq(userOrgs.userId, userId), eq(userOrgs.orgId, orgId)))
        .limit(1);

    return userOrgRole.length > 0 ? userOrgRole[0] : null;
}

/**
 * Check if role has access to resource
 */
export async function getRoleResourceAccess(
    resourceId: number,
    roleId: number
) {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/role/${roleId}/resource/${resourceId}/access`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return null;
        }
    }

    const roleResourceAccess = await db
        .select()
        .from(roleResources)
        .where(
            and(
                eq(roleResources.resourceId, resourceId),
                eq(roleResources.roleId, roleId)
            )
        )
        .limit(1);

    return roleResourceAccess.length > 0 ? roleResourceAccess[0] : null;
}

/**
 * Check if user has direct access to resource
 */
export async function getUserResourceAccess(
    userId: string,
    resourceId: number
) {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/user/${userId}/resource/${resourceId}/access`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return null;
        }
    }

    const userResourceAccess = await db
        .select()
        .from(userResources)
        .where(
            and(
                eq(userResources.userId, userId),
                eq(userResources.resourceId, resourceId)
            )
        )
        .limit(1);

    return userResourceAccess.length > 0 ? userResourceAccess[0] : null;
}

/**
 * Get resource rules for a given resource
 */
export async function getResourceRules(
    resourceId: number
): Promise<ResourceRule[]> {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/resource/${resourceId}/rules`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return [];
        }
    }

    const rules = await db
        .select()
        .from(resourceRules)
        .where(eq(resourceRules.resourceId, resourceId));

    return rules;
}

/**
 * Get organization login page
 */
export async function getOrgLoginPage(
    orgId: string
): Promise<LoginPage | null> {
    if (config.isManagedMode()) {
        try {
            const response = await axios.get(
                `${config.getRawConfig().managed?.endpoint}/api/v1/hybrid/org/${orgId}/login-page`,
                await tokenManager.getAuthHeader()
            );
            return response.data.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error("Error fetching config in verify session:", {
                    message: error.message,
                    code: error.code,
                    status: error.response?.status,
                    statusText: error.response?.statusText,
                    url: error.config?.url,
                    method: error.config?.method
                });
            } else {
                logger.error("Error fetching config in verify session:", error);
            }
            return null;
        }
    }

    const [result] = await db
        .select()
        .from(loginPageOrg)
        .where(eq(loginPageOrg.orgId, orgId))
        .innerJoin(
            loginPage,
            eq(loginPageOrg.loginPageId, loginPage.loginPageId)
        )
        .limit(1);

    if (!result) {
        return null;
    }

    return result?.loginPage;
}
