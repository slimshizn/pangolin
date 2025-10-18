import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import config from "@server/lib/config";
import logger from "@server/logger";
import {
    errorHandlerMiddleware,
    notFoundMiddleware
} from "@server/middlewares";
import { internalRouter } from "#dynamic/routers/internal";
import { stripDuplicateSesions } from "./middlewares/stripDuplicateSessions";

const internalPort = config.getRawConfig().server.internal_port;

export function createInternalServer() {
    const internalServer = express();

    internalServer.use(helmet());
    internalServer.use(cors());
    internalServer.use(stripDuplicateSesions);
    internalServer.use(cookieParser());
    internalServer.use(express.json());

    const prefix = `/api/v1`;
    internalServer.use(prefix, internalRouter);

    internalServer.use(notFoundMiddleware);
    internalServer.use(errorHandlerMiddleware);

    internalServer.listen(internalPort, (err?: any) => {
        if (err) throw err;
        logger.info(
            `Internal server is running on http://localhost:${internalPort}`
        );
    });

    return internalServer;
}
