import { Router } from "express";
import * as gerbil from "@server/routers/gerbil";
import * as traefik from "@server/routers/traefik";
import * as resource from "./resource";
import * as badger from "./badger";
import * as auth from "@server/routers/auth";
import * as supporterKey from "@server/routers/supporterKey";
import * as license from "@server/routers/license";
import * as idp from "@server/routers/idp";
import * as loginPage from "@server/routers/private/loginPage";
import { proxyToRemote } from "@server/lib/remoteProxy";
import config from "@server/lib/config";
import HttpCode from "@server/types/HttpCode";
import {
    verifyResourceAccess,
    verifySessionUserMiddleware
} from "@server/middlewares";
import { build } from "@server/build";
import * as billing from "@server/routers/private/billing";
import * as orgIdp from "@server/routers/private/orgIdp";

// Root routes
const internalRouter = Router();

internalRouter.get("/", (_, res) => {
    res.status(HttpCode.OK).json({ message: "Healthy" });
});

internalRouter.get("/traefik-config", traefik.traefikConfigProvider);

internalRouter.get(
    "/resource-session/:resourceId/:token",
    auth.checkResourceSession
);

internalRouter.post(
    `/resource/:resourceId/get-exchange-token`,
    verifySessionUserMiddleware,
    verifyResourceAccess,
    resource.getExchangeToken
);

internalRouter.get(
    `/supporter-key/visible`,
    supporterKey.isSupporterKeyVisible
);

internalRouter.get(`/license/status`, license.getLicenseStatus);

internalRouter.get("/idp", idp.listIdps);

internalRouter.get("/idp/:idpId", idp.getIdp);

if (build !== "oss") {
    internalRouter.get("/org/:orgId/idp", orgIdp.listOrgIdps);
    
    internalRouter.get("/org/:orgId/billing/tier", billing.getOrgTier);
}

// Gerbil routes
const gerbilRouter = Router();
internalRouter.use("/gerbil", gerbilRouter);

if (config.isManagedMode()) {
    // Use proxy router to forward requests to remote cloud server
    // Proxy endpoints for each gerbil route
    gerbilRouter.post("/receive-bandwidth", (req, res, next) =>
        proxyToRemote(req, res, next, "hybrid/gerbil/receive-bandwidth")
    );

    gerbilRouter.post("/update-hole-punch", (req, res, next) =>
        proxyToRemote(req, res, next, "hybrid/gerbil/update-hole-punch")
    );

    gerbilRouter.post("/get-all-relays", (req, res, next) =>
        proxyToRemote(req, res, next, "hybrid/gerbil/get-all-relays")
    );

    gerbilRouter.post("/get-resolved-hostname", (req, res, next) =>
        proxyToRemote(req, res, next, `hybrid/gerbil/get-resolved-hostname`)
    );

    // GET CONFIG IS HANDLED IN THE ORIGINAL HANDLER
    // SO IT CAN REGISTER THE LOCAL EXIT NODE
} else {
    // Use local gerbil endpoints
    gerbilRouter.post("/receive-bandwidth", gerbil.receiveBandwidth);
    gerbilRouter.post("/update-hole-punch", gerbil.updateHolePunch);
    gerbilRouter.post("/get-all-relays", gerbil.getAllRelays);
    gerbilRouter.post("/get-resolved-hostname", gerbil.getResolvedHostname);
}

// WE HANDLE THE PROXY INSIDE OF THIS FUNCTION
// SO IT REGISTERS THE EXIT NODE LOCALLY AS WELL
gerbilRouter.post("/get-config", gerbil.getConfig);

// Badger routes
const badgerRouter = Router();
internalRouter.use("/badger", badgerRouter);

badgerRouter.post("/verify-session", badger.verifyResourceSession);

if (config.isManagedMode()) {
    badgerRouter.post("/exchange-session", (req, res, next) =>
        proxyToRemote(req, res, next, "hybrid/badger/exchange-session")
    );
} else {
    badgerRouter.post("/exchange-session", badger.exchangeSession);
}

if (build !== "oss") {
    internalRouter.get("/login-page", loginPage.loadLoginPage);

    internalRouter.post(
        "/get-session-transfer-token",
        verifySessionUserMiddleware,
        auth.getSessionTransferToken
    );
}

export default internalRouter;
