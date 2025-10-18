/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import * as certificates from "#private/routers/certificates";
import { createStore } from "#private/lib/rateLimitStore";
import * as billing from "#private/routers/billing";
import * as remoteExitNode from "#private/routers/remoteExitNode";
import * as loginPage from "#private/routers/loginPage";
import * as orgIdp from "#private/routers/orgIdp";
import * as domain from "#private/routers/domain";
import * as auth from "#private/routers/auth";
import * as license from "#private/routers/license";
import * as generateLicense from "./generatedLicense";

import { Router } from "express";
import {
    verifyOrgAccess,
    verifyUserHasAction,
    verifyUserIsOrgOwner,
    verifyUserIsServerAdmin
} from "@server/middlewares";
import { ActionsEnum } from "@server/auth/actions";
import {
    verifyCertificateAccess,
    verifyIdpAccess,
    verifyLoginPageAccess,
    verifyRemoteExitNodeAccess
} from "#private/middlewares";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { verifyValidLicense } from "../middlewares/verifyValidLicense";
import { build } from "@server/build";
import {
    unauthenticated as ua,
    authenticated as a,
    authRouter as aa
} from "@server/routers/external";

export const authenticated = a;
export const unauthenticated = ua;
export const authRouter = aa;

unauthenticated.post(
    "/remote-exit-node/quick-start",
    verifyValidLicense,
    rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 5,
        keyGenerator: (req) => `${req.path}:${ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only create 5 remote exit nodes every hour. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    remoteExitNode.quickStartRemoteExitNode
);

authenticated.put(
    "/org/:orgId/idp/oidc",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createIdp),
    orgIdp.createOrgOidcIdp
);

authenticated.post(
    "/org/:orgId/idp/:idpId/oidc",
    verifyValidLicense,
    verifyOrgAccess,
    verifyIdpAccess,
    verifyUserHasAction(ActionsEnum.updateIdp),
    orgIdp.updateOrgOidcIdp
);

authenticated.delete(
    "/org/:orgId/idp/:idpId",
    verifyValidLicense,
    verifyOrgAccess,
    verifyIdpAccess,
    verifyUserHasAction(ActionsEnum.deleteIdp),
    orgIdp.deleteOrgIdp
);

authenticated.get(
    "/org/:orgId/idp/:idpId",
    verifyValidLicense,
    verifyOrgAccess,
    verifyIdpAccess,
    verifyUserHasAction(ActionsEnum.getIdp),
    orgIdp.getOrgIdp
);

authenticated.get(
    "/org/:orgId/idp",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listIdps),
    orgIdp.listOrgIdps
);

authenticated.get("/org/:orgId/idp", orgIdp.listOrgIdps); // anyone can see this; it's just a list of idp names and ids

authenticated.get(
    "/org/:orgId/certificate/:domainId/:domain",
    verifyValidLicense,
    verifyOrgAccess,
    verifyCertificateAccess,
    verifyUserHasAction(ActionsEnum.getCertificate),
    certificates.getCertificate
);

authenticated.post(
    "/org/:orgId/certificate/:certId/restart",
    verifyValidLicense,
    verifyOrgAccess,
    verifyCertificateAccess,
    verifyUserHasAction(ActionsEnum.restartCertificate),
    certificates.restartCertificate
);

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
        auth.quickStart
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

    authenticated.get(
        "/org/:orgId/license",
        verifyOrgAccess,
        generateLicense.listSaasLicenseKeys
    );

    authenticated.put(
        "/org/:orgId/license",
        verifyOrgAccess,
        generateLicense.generateNewLicense
    );
}

authenticated.get(
    "/domain/namespaces",
    verifyValidLicense,
    domain.listDomainNamespaces
);

authenticated.get(
    "/domain/check-namespace-availability",
    verifyValidLicense,
    domain.checkDomainNamespaceAvailability
);

authenticated.put(
    "/org/:orgId/remote-exit-node",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createRemoteExitNode),
    remoteExitNode.createRemoteExitNode
);

authenticated.get(
    "/org/:orgId/remote-exit-nodes",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.listRemoteExitNode),
    remoteExitNode.listRemoteExitNodes
);

authenticated.get(
    "/org/:orgId/remote-exit-node/:remoteExitNodeId",
    verifyValidLicense,
    verifyOrgAccess,
    verifyRemoteExitNodeAccess,
    verifyUserHasAction(ActionsEnum.getRemoteExitNode),
    remoteExitNode.getRemoteExitNode
);

authenticated.get(
    "/org/:orgId/pick-remote-exit-node-defaults",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createRemoteExitNode),
    remoteExitNode.pickRemoteExitNodeDefaults
);

authenticated.delete(
    "/org/:orgId/remote-exit-node/:remoteExitNodeId",
    verifyValidLicense,
    verifyOrgAccess,
    verifyRemoteExitNodeAccess,
    verifyUserHasAction(ActionsEnum.deleteRemoteExitNode),
    remoteExitNode.deleteRemoteExitNode
);

authenticated.put(
    "/org/:orgId/login-page",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.createLoginPage),
    loginPage.createLoginPage
);

authenticated.post(
    "/org/:orgId/login-page/:loginPageId",
    verifyValidLicense,
    verifyOrgAccess,
    verifyLoginPageAccess,
    verifyUserHasAction(ActionsEnum.updateLoginPage),
    loginPage.updateLoginPage
);

authenticated.delete(
    "/org/:orgId/login-page/:loginPageId",
    verifyValidLicense,
    verifyOrgAccess,
    verifyLoginPageAccess,
    verifyUserHasAction(ActionsEnum.deleteLoginPage),
    loginPage.deleteLoginPage
);

authenticated.get(
    "/org/:orgId/login-page",
    verifyValidLicense,
    verifyOrgAccess,
    verifyUserHasAction(ActionsEnum.getLoginPage),
    loginPage.getLoginPage
);

authRouter.post(
    "/remoteExitNode/get-token",
    verifyValidLicense,
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 900,
        keyGenerator: (req) =>
            `remoteExitNodeGetToken:${req.body.newtId || ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only request an remoteExitNodeToken token ${900} times every ${15} minutes. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    remoteExitNode.getRemoteExitNodeToken
);

authRouter.post(
    "/transfer-session-token",
    verifyValidLicense,
    rateLimit({
        windowMs: 1 * 60 * 1000,
        max: 60,
        keyGenerator: (req) =>
            `transferSessionToken:${ipKeyGenerator(req.ip || "")}`,
        handler: (req, res, next) => {
            const message = `You can only transfer a session token ${5} times every ${1} minute. Please try again later.`;
            return next(createHttpError(HttpCode.TOO_MANY_REQUESTS, message));
        },
        store: createStore()
    }),
    auth.transferSession
);

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
