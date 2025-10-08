import { Router } from "express";
import config from "@server/lib/config";
import * as site from "./site";
import * as org from "./org";
import * as resource from "./resource";
import * as domain from "./domain";
import * as target from "./target";
import * as user from "./user";
import * as auth from "./auth";
import * as role from "./role";
import * as client from "./client";
import * as siteResource from "./siteResource";
import * as supporterKey from "./supporterKey";
import * as accessToken from "./accessToken";
import * as idp from "./idp";
import * as license from "./license";
import * as apiKeys from "./apiKeys";
import HttpCode from "@server/types/HttpCode";
import {
    verifyAccessTokenAccess,
    verifySessionMiddleware,
    verifySessionUserMiddleware,
    verifyOrgAccess,
    verifySiteAccess,
    verifyResourceAccess,
    verifyTargetAccess,
    verifyRoleAccess,
    verifySetResourceUsers,
    verifyUserAccess,
    getUserOrgs,
    verifyUserIsServerAdmin,
    verifyIsLoggedInUser,
    verifyClientAccess,
    verifyApiKeyAccess,
    verifyDomainAccess,
    verifyClientsEnabled,
    verifyUserHasAction,
    verifyUserIsOrgOwner,
    verifySiteResourceAccess
} from "@server/middlewares";
import {
    verifyCertificateAccess,
    verifyRemoteExitNodeAccess,
    verifyIdpAccess,
    verifyLoginPageAccess
} from "@server/middlewares/private";
import { createStore } from "@server/lib/private/rateLimitStore";
import { ActionsEnum } from "@server/auth/actions";
import { createNewt, getNewtToken } from "./newt";
import { getOlmToken } from "./olm";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import createHttpError from "http-errors";
import * as certificates from "./private/certificates";
import * as billing from "@server/routers/private/billing";
import { quickStart } from "./auth/privateQuickStart";
import { build } from "@server/build";
import * as remoteExitNode from "@server/routers/private/remoteExitNode";
import * as loginPage from "@server/routers/private/loginPage";
import * as orgIdp from "@server/routers/private/orgIdp";

// Root routes
export const unauthenticated = Router();

unauthenticated.get("/", (_, res) => {
    res.status(HttpCode.OK).json({ message: "Healthy" });
});

if (build === "saas") {
    unauthenticated.post(
        "/quick-start",
        rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 100,
            keyGenerator: (req) => req.path,
            handler: (req, res, next) => {
                const message = `We're too busy right now. Please try again later.`;
                return next(
                    createHttpError(HttpCode.TOO_MANY_REQUESTS, message)
                );
            },
            store: createStore()
        }),
        quickStart
    );
}

if (build !== "oss") {
    unauthenticated.post(
        "/remote-exit-node/quick-start",
        rateLimit({
            windowMs: 60 * 60 * 1000,
            max: 5,
            keyGenerator: (req) =>
                `${req.path}:${ipKeyGenerator(req.ip || "")}`,
            handler: (req, res, next) => {
                const message = `You can only create 5 remote exit nodes every hour. Please try again later.`;
                return next(
                    createHttpError(HttpCode.TOO_MANY_REQUESTS, message)
                );
            },
            store: createStore()
        }),
        remoteExitNode.quickStartRemoteExitNode
    );
}

// Authenticated Root routes
export const authenticated = Router();
authenticated.use(verifySessionUserMiddleware);

authenticated.get("/pick-org-defaults", org.pickOrgDefaults);
authenticated.get("/org/checkId", org.checkId);
if (build === "oss" || build === "enterprise") {
    authenticated.put("/org", getUserOrgs, org.createOrg);
}

authenticated.get("/orgs", verifyUserIsServerAdmin, org.listOrgs);
authenticated.get("/user/:userId/orgs", verifyIsLoggedInUser, org.listUserOrgs);

authenticated.get(
    "/org/:orgId",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.getOrg),
    org.getOrg
);
authenticated.post(
    "/org/:orgId",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.updateOrg),
    org.updateOrg
);

if (build !== "saas") {
    authenticated.delete(
        "/org/:orgId",
        verifyOrgAccess,
        verifyUserIsOrgOwner,
        verifyUserHasAction(ActionsEnum.deleteOrg),
        org.deleteOrg
    );
}

authenticated.put(
    "/org/:orgId/site",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createSite),
    site.createSite
);
authenticated.get(
    "/org/:orgId/sites",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listSites),
    site.listSites
);
authenticated.get(
    "/org/:orgId/site/:niceId",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.getSite
);

authenticated.get(
    "/org/:orgId/pick-site-defaults",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createSite),
    site.pickSiteDefaults
);
authenticated.get(
    "/site/:siteId",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.getSite
);

authenticated.get(
    "/org/:orgId/pick-client-defaults",
    verifyClientsEnabled,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createClient),
    client.pickClientDefaults
);

authenticated.get(
    "/org/:orgId/clients",
    verifyClientsEnabled,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listClients),
    client.listClients
);

authenticated.get(
    "/client/:clientId",
    verifyClientsEnabled,
    verifyClientAccess,
    verifyUserHasAction(ActionsEnum.getClient),
    client.getClient
);

authenticated.put(
    "/org/:orgId/client",
    verifyClientsEnabled,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createClient),
    client.createClient
);

authenticated.delete(
    "/client/:clientId",
    verifyClientsEnabled,
    verifyClientAccess,
    verifyUserHasAction(ActionsEnum.deleteClient),
    client.deleteClient
);

authenticated.post(
    "/client/:clientId",
    verifyClientsEnabled,
    verifyClientAccess, // this will check if the user has access to the client
    verifyUserHasAction(ActionsEnum.updateClient), // this will check if the user has permission to update the client
    client.updateClient
);

// authenticated.get(
//     "/site/:siteId/roles",
//     verifySiteAccess,
//     verifyUserHasAction(ActionsEnum.listSiteRoles),
//     site.listSiteRoles
// );
authenticated.post(
    "/site/:siteId",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.updateSite),
    site.updateSite
);
authenticated.delete(
    "/site/:siteId",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.deleteSite),
    site.deleteSite
);

authenticated.get(
    "/site/:siteId/docker/status",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.dockerStatus
);
authenticated.get(
    "/site/:siteId/docker/online",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.dockerOnline
);
authenticated.post(
    "/site/:siteId/docker/check",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.checkDockerSocket
);
authenticated.post(
    "/site/:siteId/docker/trigger",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.triggerFetchContainers
);
authenticated.get(
    "/site/:siteId/docker/containers",
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.getSite),
    site.listContainers
);

// Site Resource endpoints
authenticated.put(
    "/org/:orgId/site/:siteId/resource",
    verifyOrgAccess,
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.createSiteResource),
    siteResource.createSiteResource
);

authenticated.get(
    "/org/:orgId/site/:siteId/resources",
    verifyOrgAccess,
    verifySiteAccess,
    verifyUserHasAction(ActionsEnum.listSiteResources),
    siteResource.listSiteResources
);

authenticated.get(
    "/org/:orgId/site-resources",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listSiteResources),
    siteResource.listAllSiteResourcesByOrg
);

authenticated.get(
    "/org/:orgId/site/:siteId/resource/:siteResourceId",
    verifyOrgAccess,
    verifySiteAccess,
    verifySiteResourceAccess,
    verifyUserHasAction(ActionsEnum.getSiteResource),
    siteResource.getSiteResource
);

authenticated.post(
    "/org/:orgId/site/:siteId/resource/:siteResourceId",
    verifyOrgAccess,
    verifySiteAccess,
    verifySiteResourceAccess,
    verifyUserHasAction(ActionsEnum.updateSiteResource),
    siteResource.updateSiteResource
);

authenticated.delete(
    "/org/:orgId/site/:siteId/resource/:siteResourceId",
    verifyOrgAccess,
    verifySiteAccess,
    verifySiteResourceAccess,
    verifyUserHasAction(ActionsEnum.deleteSiteResource),
    siteResource.deleteSiteResource
);

authenticated.put(
    "/org/:orgId/resource",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createResource),
    resource.createResource
);

authenticated.get(
    "/site/:siteId/resources",
    verifyUserHasAction(ActionsEnum.listResources),
    resource.listResources
);

authenticated.get(
    "/org/:orgId/resources",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listResources),
    resource.listResources
);

authenticated.get(
    "/org/:orgId/user-resources",
    verifyOrgAccess,
    resource.getUserResources
);

authenticated.get(
    "/org/:orgId/domains",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listOrgDomains),
    domain.listDomains
);

authenticated.get(
    "/org/:orgId/invitations",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listInvitations),
    user.listInvitations
);

authenticated.delete(
    "/org/:orgId/invitations/:inviteId",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.removeInvitation),
    user.removeInvitation
);

authenticated.post(
    "/org/:orgId/create-invite",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.inviteUser),
    user.inviteUser
); // maybe make this /invite/create instead
unauthenticated.post("/invite/accept", user.acceptInvite); // this is supposed to be unauthenticated

authenticated.get(
    "/resource/:resourceId/roles",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.listResourceRoles),
    resource.listResourceRoles
);

authenticated.get(
    "/resource/:resourceId/users",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.listResourceUsers),
    resource.listResourceUsers
);

authenticated.get(
    "/resource/:resourceId",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.getResource),
    resource.getResource
);
authenticated.get(
    "/org/:orgId/resource/:niceId",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.getResource),
    resource.getResource
);
authenticated.post(
    "/resource/:resourceId",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.updateResource),
    resource.updateResource
);
authenticated.delete(
    "/resource/:resourceId",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.deleteResource),
    resource.deleteResource
);

authenticated.put(
    "/resource/:resourceId/target",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.createTarget),
    target.createTarget
);
authenticated.get(
    "/resource/:resourceId/targets",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.listTargets),
    target.listTargets
);

authenticated.put(
    "/resource/:resourceId/rule",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.createResourceRule),
    resource.createResourceRule
);
authenticated.get(
    "/resource/:resourceId/rules",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.listResourceRules),
    resource.listResourceRules
);
authenticated.post(
    "/resource/:resourceId/rule/:ruleId",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.updateResourceRule),
    resource.updateResourceRule
);
authenticated.delete(
    "/resource/:resourceId/rule/:ruleId",
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.deleteResourceRule),
    resource.deleteResourceRule
);

authenticated.get(
    "/target/:targetId",
    verifyTargetAccess,
    verifyUserHasAction(ActionsEnum.getTarget),
    target.getTarget
);
authenticated.post(
    "/target/:targetId",
    verifyTargetAccess,
    verifyUserHasAction(ActionsEnum.updateTarget),
    target.updateTarget
);
authenticated.delete(
    "/target/:targetId",
    verifyTargetAccess,
    verifyUserHasAction(ActionsEnum.deleteTarget),
    target.deleteTarget
);

authenticated.put(
    "/org/:orgId/role",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createRole),
    role.createRole
);
authenticated.get(
    "/org/:orgId/roles",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listRoles),
    role.listRoles
);
// authenticated.get(
//     "/role/:roleId",
//     verifyRoleAccess,
//     verifyUserInRole,
//     verifyUserHasAction(ActionsEnum.getRole),
//     role.getRole
// );
// authenticated.post(
//     "/role/:roleId",
//     verifyRoleAccess,
//     verifyUserHasAction(ActionsEnum.updateRole),
//     role.updateRole
// );
authenticated.delete(
    "/role/:roleId",
    verifyRoleAccess,
    verifyUserHasAction(ActionsEnum.deleteRole),
    role.deleteRole
);
authenticated.post(
    "/role/:roleId/add/:userId",
    verifyRoleAccess,
    verifyUserAccess,
    verifyUserHasAction(ActionsEnum.addUserRole),
    user.addUserRole
);

authenticated.post(
    "/resource/:resourceId/roles",
    verifyResourceAccess,
    verifyRoleAccess,
    verifyUserHasAction(ActionsEnum.setResourceRoles),
    resource.setResourceRoles
);

authenticated.post(
    "/resource/:resourceId/users",
    verifyResourceAccess,
    verifySetResourceUsers,
    verifyUserHasAction(ActionsEnum.setResourceUsers),
    resource.setResourceUsers
);

authenticated.post(
    `/resource/:resourceId/password`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.setResourcePassword),
    resource.setResourcePassword
);

authenticated.post(
    `/resource/:resourceId/pincode`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.setResourcePincode),
    resource.setResourcePincode
);

authenticated.post(
    `/resource/:resourceId/header-auth`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.setResourceHeaderAuth),
    resource.setResourceHeaderAuth
);

authenticated.post(
    `/resource/:resourceId/whitelist`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.setResourceWhitelist),
    resource.setResourceWhitelist
);

authenticated.get(
    `/resource/:resourceId/whitelist`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.getResourceWhitelist),
    resource.getResourceWhitelist
);

authenticated.post(
    `/resource/:resourceId/access-token`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.generateAccessToken),
    accessToken.generateAccessToken
);

authenticated.delete(
    `/access-token/:accessTokenId`,
    verifyAccessTokenAccess,
    verifyUserHasAction(ActionsEnum.deleteAcessToken),
    accessToken.deleteAccessToken
);

authenticated.get(
    `/org/:orgId/access-tokens`,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listAccessTokens),
    accessToken.listAccessTokens
);

authenticated.get(
    `/resource/:resourceId/access-tokens`,
    verifyResourceAccess,
    verifyUserHasAction(ActionsEnum.listAccessTokens),
    accessToken.listAccessTokens
);

authenticated.get(`/org/:orgId/overview`, verifyOrgAccess, org.getOrgOverview);

authenticated.post(
    `/supporter-key/validate`,
    supporterKey.validateSupporterKey
);
authenticated.post(`/supporter-key/hide`, supporterKey.hideSupporterKey);

unauthenticated.get(
    "/resource/:resourceGuid/auth",
    resource.getResourceAuthInfo
);

// authenticated.get(
//     "/role/:roleId/resources",
//     verifyRoleAccess,
//     verifyUserInRole,
//     verifyUserHasAction(ActionsEnum.listRoleResources),
//     role.listRoleResources
// );
// authenticated.put(
//     "/role/:roleId/action",
//     verifyRoleAccess,
//     verifyUserInRole,
//     verifyUserHasAction(ActionsEnum.addRoleAction),
//     role.addRoleAction
// );
// authenticated.delete(
//     "/role/:roleId/action",
//     verifyRoleAccess,
//     verifyUserInRole,
//     verifyUserHasAction(ActionsEnum.removeRoleAction),
//     role.removeRoleAction
// );
// authenticated.get(
//     "/role/:roleId/actions",
//     verifyRoleAccess,
//     verifyUserInRole,
//     verifyUserHasAction(ActionsEnum.listRoleActions),
//     role.listRoleActions
// );

unauthenticated.get("/user", verifySessionMiddleware, user.getUser);

authenticated.get("/users", verifyUserIsServerAdmin, user.adminListUsers);
authenticated.get("/user/:userId", verifyUserIsServerAdmin, user.adminGetUser);
authenticated.delete(
    "/user/:userId",
    verifyUserIsServerAdmin,
    user.adminRemoveUser
);

authenticated.put(
    "/org/:orgId/user",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createOrgUser),
    user.createOrgUser
);

authenticated.post(
    "/org/:orgId/user/:userId",
    verifyOrgAccess,
    verifyUserAccess,
    verifyUserHasAction(ActionsEnum.updateOrgUser),
    user.updateOrgUser
);

authenticated.get("/org/:orgId/user/:userId", verifyOrgAccess, user.getOrgUser);

authenticated.post(
    "/user/:userId/2fa",
    verifyUserIsServerAdmin,
    user.updateUser2FA
);

authenticated.get(
    "/org/:orgId/users",
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listUsers),
    user.listUsers
);
authenticated.delete(
    "/org/:orgId/user/:userId",
    verifyOrgAccess,
    verifyUserAccess,
    verifyUserHasAction(ActionsEnum.removeUser),
    user.removeUserOrg
);

// authenticated.put(
//     "/user/:userId/site",
//     verifySiteAccess,
//     verifyUserAccess,
//     verifyUserHasAction(ActionsEnum.addRoleSite),
//     role.addRoleSite
// );
// authenticated.delete(
//     "/user/:userId/site",
//     verifySiteAccess,
//     verifyUserAccess,
//     verifyUserHasAction(ActionsEnum.removeRoleSite),
//     role.removeRoleSite
// );
// authenticated.put(
//     "/org/:orgId/user/:userId/action",
//     verifyOrgAccess,
//     verifyUserAccess,
//     verifyUserHasAction(ActionsEnum.addRoleAction),
//     role.addRoleAction
// );
// authenticated.delete(
//     "/org/:orgId/user/:userId/action",
//     verifyOrgAccess,
//     verifyUserAccess,
//     verifyUserHasAction(ActionsEnum.removeRoleAction),
//     role.removeRoleAction
// );

// authenticated.put(
//     "/newt",
//     verifyUserHasAction(ActionsEnum.createNewt),
//     createNewt
// );

authenticated.put(
    "/idp/oidc",
    verifyUserIsServerAdmin,
    // verifyUserHasAction(ActionsEnum.createIdp),
    idp.createOidcIdp
);

authenticated.post(
    "/idp/:idpId/oidc",
    verifyUserIsServerAdmin,
    idp.updateOidcIdp
);

if (build !== "oss") {
    authenticated.put(
        "/org/:orgId/idp/oidc",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.createIdp),
        orgIdp.createOrgOidcIdp
    );

    authenticated.post(
        "/org/:orgId/idp/:idpId/oidc",
        verifyOrgAccess,
        verifyIdpAccess,
        verifyUserHasAction(ActionsEnum.updateIdp),
        orgIdp.updateOrgOidcIdp
    );

    authenticated.delete(
        "/org/:orgId/idp/:idpId",
        verifyOrgAccess,
        verifyIdpAccess,
        verifyUserHasAction(ActionsEnum.deleteIdp),
        idp.deleteIdp
    );

    authenticated.get(
        "/org/:orgId/idp/:idpId",
        verifyOrgAccess,
        verifyIdpAccess,
        verifyUserHasAction(ActionsEnum.getIdp),
        orgIdp.getOrgIdp
    );

    authenticated.get(
        "/org/:orgId/idp",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.listIdps),
        orgIdp.listOrgIdps
    );
}

authenticated.delete("/idp/:idpId", verifyUserIsServerAdmin, idp.deleteIdp);

authenticated.get("/idp/:idpId", verifyUserIsServerAdmin, idp.getIdp);

authenticated.put(
    "/idp/:idpId/org/:orgId",
    verifyUserIsServerAdmin,
    idp.createIdpOrgPolicy
);

authenticated.post(
    "/idp/:idpId/org/:orgId",
    verifyUserIsServerAdmin,
    idp.updateIdpOrgPolicy
);

authenticated.delete(
    "/idp/:idpId/org/:orgId",
    verifyUserIsServerAdmin,
    idp.deleteIdpOrgPolicy
);

authenticated.get(
    "/idp/:idpId/org",
    verifyUserIsServerAdmin,
    idp.listIdpOrgPolicies
);

if (build !== "oss") {
    authenticated.get("/org/:orgId/idp", orgIdp.listOrgIdps); // anyone can see this; it's just a list of idp names and ids
}
authenticated.get("/idp", idp.listIdps); // anyone can see this; it's just a list of idp names and ids
authenticated.get("/idp/:idpId", verifyUserIsServerAdmin, idp.getIdp);

authenticated.post(
    "/license/activate",
    verifyUserIsServerAdmin,
    license.activateLicense
);

authenticated.get(
    "/license/keys",
    verifyUserIsServerAdmin,
    license.listLicenseKeys
);

authenticated.delete(
    "/license/:licenseKey",
    verifyUserIsServerAdmin,
    license.deleteLicenseKey
);

authenticated.post(
    "/license/recheck",
    verifyUserIsServerAdmin,
    license.recheckStatus
);

authenticated.get(
    `/api-key/:apiKeyId`,
    verifyUserIsServerAdmin,
    apiKeys.getApiKey
);

authenticated.put(
    `/api-key`,
    verifyUserIsServerAdmin,
    apiKeys.createRootApiKey
);

authenticated.delete(
    `/api-key/:apiKeyId`,
    verifyUserIsServerAdmin,
    apiKeys.deleteApiKey
);

authenticated.get(
    `/api-keys`,
    verifyUserIsServerAdmin,
    apiKeys.listRootApiKeys
);

authenticated.get(
    `/api-key/:apiKeyId/actions`,
    verifyUserIsServerAdmin,
    apiKeys.listApiKeyActions
);

authenticated.post(
    `/api-key/:apiKeyId/actions`,
    verifyUserIsServerAdmin,
    apiKeys.setApiKeyActions
);

authenticated.get(
    `/org/:orgId/api-keys`,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listApiKeys),
    apiKeys.listOrgApiKeys
);

authenticated.post(
    `/org/:orgId/api-key/:apiKeyId/actions`,
    verifyOrgAccess,
    verifyApiKeyAccess,
    verifyUserHasAction(ActionsEnum.setApiKeyActions),
    apiKeys.setApiKeyActions
);

authenticated.get(
    `/org/:orgId/api-key/:apiKeyId/actions`,
    verifyOrgAccess,
    verifyApiKeyAccess,
    verifyUserHasAction(ActionsEnum.listApiKeyActions),
    apiKeys.listApiKeyActions
);

authenticated.put(
    `/org/:orgId/api-key`,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createApiKey),
    apiKeys.createOrgApiKey
);

authenticated.delete(
    `/org/:orgId/api-key/:apiKeyId`,
    verifyOrgAccess,
    verifyApiKeyAccess,
    verifyUserHasAction(ActionsEnum.deleteApiKey),
    apiKeys.deleteOrgApiKey
);

authenticated.get(
    `/org/:orgId/api-key/:apiKeyId`,
    verifyOrgAccess,
    verifyApiKeyAccess,
    verifyUserHasAction(ActionsEnum.getApiKey),
    apiKeys.getApiKey
);

authenticated.put(
    `/org/:orgId/domain`,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createOrgDomain),
    domain.createOrgDomain
);

authenticated.post(
    `/org/:orgId/domain/:domainId/restart`,
    verifyOrgAccess,
    verifyDomainAccess,
    verifyUserHasAction(ActionsEnum.restartOrgDomain),
    domain.restartOrgDomain
);

authenticated.delete(
    `/org/:orgId/domain/:domainId`,
    verifyOrgAccess,
    verifyDomainAccess,
    verifyUserHasAction(ActionsEnum.deleteOrgDomain),
    domain.deleteAccountDomain
);

if (build !== "oss") {
    authenticated.get(
        "/org/:orgId/certificate/:domainId/:domain",
        verifyOrgAccess,
        verifyCertificateAccess,
        verifyUserHasAction(ActionsEnum.getCertificate),
        certificates.getCertificate
    );

    authenticated.post(
        "/org/:orgId/certificate/:certId/restart",
        verifyOrgAccess,
        verifyCertificateAccess,
        verifyUserHasAction(ActionsEnum.restartCertificate),
        certificates.restartCertificate
    );

    authenticated.post(
        "/org/:orgId/billing/create-checkout-session",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.billing),
        billing.createCheckoutSession
    );

    authenticated.post(
        "/org/:orgId/billing/create-portal-session",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.billing),
        billing.createPortalSession
    );

    authenticated.get(
        "/org/:orgId/billing/subscription",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.billing),
        billing.getOrgSubscription
    );

    authenticated.get(
        "/org/:orgId/billing/usage",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.billing),
        billing.getOrgUsage
    );

    authenticated.get("/domain/namespaces", domain.listDomainNamespaces);

    authenticated.get(
        "/domain/check-namespace-availability",
        domain.checkDomainNamespaceAvailability
    );

    authenticated.put(
        "/org/:orgId/remote-exit-node",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.createRemoteExitNode),
        remoteExitNode.createRemoteExitNode
    );

    authenticated.get(
        "/org/:orgId/remote-exit-nodes",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.listRemoteExitNode),
        remoteExitNode.listRemoteExitNodes
    );

    authenticated.get(
        "/org/:orgId/remote-exit-node/:remoteExitNodeId",
        verifyOrgAccess,
        verifyRemoteExitNodeAccess,
        verifyUserHasAction(ActionsEnum.getRemoteExitNode),
        remoteExitNode.getRemoteExitNode
    );

    authenticated.get(
        "/org/:orgId/pick-remote-exit-node-defaults",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.createRemoteExitNode),
        remoteExitNode.pickRemoteExitNodeDefaults
    );

    authenticated.delete(
        "/org/:orgId/remote-exit-node/:remoteExitNodeId",
        verifyOrgAccess,
        verifyRemoteExitNodeAccess,
        verifyUserHasAction(ActionsEnum.deleteRemoteExitNode),
        remoteExitNode.deleteRemoteExitNode
    );

    authenticated.put(
        "/org/:orgId/login-page",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.createLoginPage),
        loginPage.createLoginPage
    );

    authenticated.post(
        "/org/:orgId/login-page/:loginPageId",
        verifyOrgAccess,
        verifyLoginPageAccess,
        verifyUserHasAction(ActionsEnum.updateLoginPage),
        loginPage.updateLoginPage
    );

    authenticated.delete(
        "/org/:orgId/login-page/:loginPageId",
        verifyOrgAccess,
        verifyLoginPageAccess,
        verifyUserHasAction(ActionsEnum.deleteLoginPage),
        loginPage.deleteLoginPage
    );

    authenticated.get(
        "/org/:orgId/login-page",
        verifyOrgAccess,
        verifyUserHasAction(ActionsEnum.getLoginPage),
        loginPage.getLoginPage
    );
}

// Auth routes
export const authRouter = Router();
unauthenticated.use("/auth", authRouter);
authRouter.use(
    rateLimit({
        windowMs: config.getRawConfig().rate_limits.auth.window_minutes,
        max: config.getRawConfig().rate_limits.auth.max_requests,
        keyGenerator: (req) =>
            `authRouterGlobal:${ipKeyGenerator(req.ip || "")}:${req.path}`,
        handler: (req, res, next) => {
            const message = `Rate limit exceeded. You can make ${config.getRawConfig().rate_limits.auth.max_requests} requests every ${config.getRawConfig().rate_limits.auth.window_minutes} minute(s).`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    })
);

authRouter.put(
    "/signup",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `signup:${ipKeyGenerator(req.ip || "")}:${req.body.email}`,
        handler: (req, res, next) => {
            const message = `You can only sign up ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.signup
);
authRouter.post(
    "/login",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `login:${req.body.email || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only log in ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.login
);
authRouter.post("/logout", auth.logout);
authRouter.post(
    "/newt/get-token",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 900,
        keyGenerator: (req) =>
            `newtGetToken:${req.body.newtId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only request a Newt token ${900} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    getNewtToken
);
authRouter.post(
    "/olm/get-token",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 900,
        keyGenerator: (req) =>
            `olmGetToken:${req.body.newtId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only request an Olm token ${900} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    getOlmToken
);

if (build !== "oss") {
    authRouter.post(
        "/remoteExitNode/get-token",
        rateLimit({
            windowMs: 15 * 60 * 1000,
            max: 900,
            keyGenerator: (req) =>
                `remoteExitNodeGetToken:${req.body.newtId || ipKeyGenerator(req.ip || "")}`,
            handler: (req, res, next) => {
                const message = `You can only request an remoteExitNodeToken token ${900} times every ${15} minutes. Please try again later.`;
                return next(
                    createHttpError(HttpCode.TOO_MANY_REQUESTS, message)
                );
            },
            store: createStore()
        }),
        remoteExitNode.getRemoteExitNodeToken
    );
}

authRouter.post(
    "/2fa/enable",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) => {
            return `signup:${req.body.email || req.user?.userId || ipKeyGenerator(req.ip || "")}`;
        },
        handler: (req, res, next) => {
            const message = `You can only enable 2FA ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.verifyTotp
);
authRouter.post(
    "/2fa/request",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) => {
            return `signup:${req.body.email || req.user?.userId || ipKeyGenerator(req.ip || "")}`;
        },
        handler: (req, res, next) => {
            const message = `You can only request a 2FA code ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.requestTotpSecret
);
authRouter.post(
    "/2fa/disable",
    verifySessionUserMiddleware,
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `signup:${req.user?.userId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only disable 2FA ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.disable2fa
);
authRouter.post(
    "/verify-email",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `signup:${req.body.email || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only sign up ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    verifySessionMiddleware,
    auth.verifyEmail
);

authRouter.post(
    "/verify-email/request",
    verifySessionMiddleware,
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `requestEmailVerificationCode:${req.user?.email || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only request an email verification code ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.requestEmailVerificationCode
);

// authRouter.post(
//     "/change-password",
//     verifySessionUserMiddleware,
//     auth.changePassword
// );

authRouter.post(
    "/reset-password/request",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `requestPasswordReset:${req.body.email || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only request a password reset ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.requestPasswordReset
);

authRouter.post(
    "/reset-password/",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `resetPassword:${req.body.email || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only request a password reset ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.resetPassword
);

authRouter.post(
    "/resource/:resourceId/password",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `authWithPassword:${ipKeyGenerator(req.ip || "")}:${req.params.resourceId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only authenticate with password ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    resource.authWithPassword
);
authRouter.post(
    "/resource/:resourceId/pincode",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `authWithPincode:${ipKeyGenerator(req.ip || "")}:${req.params.resourceId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only authenticate with pincode ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    resource.authWithPincode
);

authRouter.post(
    "/resource/:resourceId/whitelist",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 15,
        keyGenerator: (req) =>
            `authWithWhitelist:${ipKeyGenerator(req.ip || "")}:${req.body.email}:${req.params.resourceId}`,
        handler: (req, res, next) => {
            const message = `You can only request an email OTP ${15} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    resource.authWithWhitelist
);

if (build !== "oss") {
    authRouter.post(
        "/transfer-session-token",
        rateLimit({
            windowMs: 1 * 60 * 1000,
            max: 60,
            keyGenerator: (req) =>
                `transferSessionToken:${ipKeyGenerator(req.ip || "")}`,
            handler: (req, res, next) => {
                const message = `You can only transfer a session token ${5} times every ${1} minute. Please try again later.`;
                return next(
                    createHttpError(HttpCode.TOO_MANY_REQUESTS, message)
                );
            },
            store: createStore()
        }),
        auth.transferSession
    );
}

authRouter.post(
    "/resource/:resourceId/access-token",
    resource.authWithAccessToken
);

authRouter.post("/access-token", resource.authWithAccessToken);

authRouter.post("/idp/:idpId/oidc/generate-url", idp.generateOidcUrl);

authRouter.post("/idp/:idpId/oidc/validate-callback", idp.validateOidcCallback);

authRouter.put("/set-server-admin", auth.setServerAdmin);
authRouter.get("/initial-setup-complete", auth.initialSetupComplete);
authRouter.post("/validate-setup-token", auth.validateSetupToken);

// Security Key routes
authRouter.post(
    "/security-key/register/start",
    verifySessionUserMiddleware,
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // Allow 5 security key registrations per 15 minutes
        keyGenerator: (req) =>
            `securityKeyRegister:${req.user?.userId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only register a security key ${5} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.startRegistration
);
authRouter.post(
    "/security-key/register/verify",
    verifySessionUserMiddleware,
    auth.verifyRegistration
);
authRouter.post(
    "/security-key/authenticate/start",
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10, // Allow 10 authentication attempts per 15 minutes per IP
        keyGenerator: (req) => {
            return `securityKeyAuth:${req.body.email || ipKeyGenerator(req.ip || "")}`;
        },
        handler: (req, res, next) => {
            const message = `You can only attempt security key authentication ${10} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.startAuthentication
);
authRouter.post("/security-key/authenticate/verify", auth.verifyAuthentication);
authRouter.get(
    "/security-key/list",
    verifySessionUserMiddleware,
    auth.listSecurityKeys
);
authRouter.delete(
    "/security-key/:credentialId",
    verifySessionUserMiddleware,
    rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20, // Allow 10 authentication attempts per 15 minutes per IP
        keyGenerator: (req) =>
            `securityKeyAuth:${req.user?.userId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only delete a security key ${10} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.deleteSecurityKey
);
