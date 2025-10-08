import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "@server/lib/config";
import logger from "@server/logger";
import {
    errorHandlerMiddleware,
    notFoundMiddleware,
} from "@server/middlewares";
import { authenticated, unauthenticated } from "@server/routers/integration";
import { logIncomingMiddleware } from "./middlewares/logIncoming";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { registry } from "./openApi";
import fs from "fs";
import path from "path";
import { APP_PATH } from "./lib/consts";
import yaml from "js-yaml";

const dev = process.env.ENVIRONMENT !== "prod";
const externalPort = config.getRawConfig().server.integration_port;

export function createIntegrationApiServer() {
    const apiServer = express();

    const trustProxy = config.getRawConfig().server.trust_proxy;
    if (trustProxy) {
        apiServer.set("trust proxy", trustProxy);
    }

    apiServer.use(cors());

    if (!dev) {
        apiServer.use(helmet());
    }

    apiServer.use(cookieParser());
    apiServer.use(express.json());

    apiServer.use(
        "/v1/docs",
        swaggerUi.serve,
        swaggerUi.setup(getOpenApiDocumentation())
    );

    // API routes
    const prefix = `/v1`;
    apiServer.use(logIncomingMiddleware);
    apiServer.use(prefix, unauthenticated);
    apiServer.use(prefix, authenticated);

    // Error handling
    apiServer.use(notFoundMiddleware);
    apiServer.use(errorHandlerMiddleware);

    // Create HTTP server
    const httpServer = apiServer.listen(externalPort, (err?: any) => {
        if (err) throw err;
        logger.info(
            `Integration API server is running on http://localhost:${externalPort}`
        );
    });

    return httpServer;
}

function getOpenApiDocumentation() {
    const bearerAuth = registry.registerComponent(
        "securitySchemes",
        "Bearer Auth",
        {
            type: "http",
            scheme: "bearer"
        }
    );

    for (const def of registry.definitions) {
        if (def.type === "route") {
            def.route.security = [
                {
                    [bearerAuth.name]: []
                }
            ];
        }
    }

    registry.registerPath({
        method: "get",
        path: "/",
        description: "Health check",
        tags: [],
        request: {},
        responses: {}
    });

    const generator = new OpenApiGeneratorV3(registry.definitions);

    const generated = generator.generateDocument({
        openapi: "3.0.0",
        info: {
            version: "v1",
            title: "Pangolin Integration API"
        },
        servers: [{ url: "/v1" }]
    });

    // convert to yaml and save to file
    const outputPath = path.join(APP_PATH, "openapi.yaml");
    const yamlOutput = yaml.dump(generated);
    fs.writeFileSync(outputPath, yamlOutput, "utf8");
    logger.info(`OpenAPI documentation saved to ${outputPath}`);

    return generated;
}
