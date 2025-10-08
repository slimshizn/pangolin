import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "@server/lib/config";
import logger from "@server/logger";
import {
    errorHandlerMiddleware,
    notFoundMiddleware
} from "@server/middlewares";
import { corsWithLoginPageSupport } from "@server/middlewares/private/corsWithLoginPage";
import { authenticated, unauthenticated } from "@server/routers/external";
import { router as wsRouter, handleWSUpgrade } from "@server/routers/ws";
import { logIncomingMiddleware } from "./middlewares/logIncoming";
import { csrfProtectionMiddleware } from "./middlewares/csrfProtection";
import helmet from "helmet";
import { stripeWebhookHandler } from "@server/routers/private/billing/webhooks";
import { build } from "./build";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import createHttpError from "http-errors";
import HttpCode from "./types/HttpCode";
import requestTimeoutMiddleware from "./middlewares/requestTimeout";
import { createStore } from "@server/lib/private/rateLimitStore";
import hybridRouter from "@server/routers/private/hybrid";
import { stripDuplicateSesions } from "./middlewares/stripDuplicateSessions";

const dev = config.isDev;
const externalPort = config.getRawConfig().server.external_port;

export function createApiServer() {
    const apiServer = express();
    const prefix = `/api/v1`;

    const trustProxy = config.getRawConfig().server.trust_proxy;
    if (trustProxy) {
        apiServer.set("trust proxy", trustProxy);
    }

    if (build == "saas") {
        apiServer.post(
            `${prefix}/billing/webhooks`,
            express.raw({ type: "application/json" }),
            stripeWebhookHandler
        );
    }

    const corsConfig = config.getRawConfig().server.cors;

    if (build == "oss") {
        const options = {
            ...(corsConfig?.origins
                ? { origin: corsConfig.origins }
                : {
                      origin: (origin: any, callback: any) => {
                          callback(null, true);
                      }
                  }),
            ...(corsConfig?.methods && { methods: corsConfig.methods }),
            ...(corsConfig?.allowed_headers && {
                allowedHeaders: corsConfig.allowed_headers
            }),
            credentials: !(corsConfig?.credentials === false)
        };

        logger.debug("Using CORS options", options);

        apiServer.use(cors(options));
    } else {
        // Use the custom CORS middleware with loginPage support
        apiServer.use(corsWithLoginPageSupport(corsConfig));
    }

    if (!dev) {
        apiServer.use(helmet());
        apiServer.use(csrfProtectionMiddleware);
    }

    apiServer.use(stripDuplicateSesions);
    apiServer.use(cookieParser());
    apiServer.use(express.json());

    // Add request timeout middleware
    apiServer.use(requestTimeoutMiddleware(60000)); // 60 second timeout

    if (!dev) {
        apiServer.use(
            rateLimit({
                windowMs:
                    config.getRawConfig().rate_limits.global.window_minutes *
                    60 *
                    1000,
                max: config.getRawConfig().rate_limits.global.max_requests,
                keyGenerator: (req) =>
                    `apiServerGlobal:${ipKeyGenerator(req.ip || "")}:${req.path}`,
                handler: (req, res, next) => {
                    const message = `Rate limit exceeded. You can make ${config.getRawConfig().rate_limits.global.max_requests} requests every ${config.getRawConfig().rate_limits.global.window_minutes} minute(s).`;
                    return next(
                        createHttpError(HttpCode.TOO_MANY_REQUESTS, message)
                    );
                },
                store: createStore()
            })
        );
    }

    // API routes
    apiServer.use(logIncomingMiddleware);
    apiServer.use(prefix, unauthenticated);
    if (build !== "oss") {
        apiServer.use(`${prefix}/hybrid`, hybridRouter);
    }
    apiServer.use(prefix, authenticated);

    // WebSocket routes
    apiServer.use(prefix, wsRouter);

    // Error handling
    apiServer.use(notFoundMiddleware);
    apiServer.use(errorHandlerMiddleware);

    // Create HTTP server
    const httpServer = apiServer.listen(externalPort, (err?: any) => {
        if (err) throw err;
        logger.info(
            `API server is running on http://localhost:${externalPort}`
        );
    });

    // Handle WebSocket upgrades
    handleWSUpgrade(httpServer);

    return httpServer;
}
