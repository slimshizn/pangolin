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

import { NextFunction, Request, Response } from "express";
import { db } from "@server/db";
import HttpCode from "@server/types/HttpCode";
import { remoteExitNodes } from "@server/db";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { SqliteError } from "better-sqlite3";
import moment from "moment";
import { generateId } from "@server/auth/sessions/app";
import { hashPassword } from "@server/auth/password";
import logger from "@server/logger";
import z from "zod";
import { fromError } from "zod-validation-error";
import { QuickStartRemoteExitNodeResponse } from "@server/routers/remoteExitNode/types";

const INSTALLER_KEY = "af4e4785-7e09-11f0-b93a-74563c4e2a7e";

const quickStartRemoteExitNodeBodySchema = z.object({
    token: z.string()
});

export async function quickStartRemoteExitNode(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = quickStartRemoteExitNodeBodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { token } = parsedBody.data;

        const tokenValidation = validateTokenOnApi(token);
        if (!tokenValidation.isValid) {
            logger.info(`Failed token validation: ${tokenValidation.message}`);
            return next(
                createHttpError(
                    HttpCode.UNAUTHORIZED,
                    fromError(tokenValidation.message).toString()
                )
            );
        }

        const remoteExitNodeId = generateId(15);
        const secret = generateId(48);
        const secretHash = await hashPassword(secret);

        await db.insert(remoteExitNodes).values({
            remoteExitNodeId,
            secretHash,
            dateCreated: moment().toISOString()
        });

        return response<QuickStartRemoteExitNodeResponse>(res, {
            data: {
                remoteExitNodeId,
                secret
            },
            success: true,
            error: false,
            message: "Remote exit node created successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        if (e instanceof SqliteError && e.code === "SQLITE_CONSTRAINT_UNIQUE") {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "A remote exit node with that ID already exists"
                )
            );
        } else {
            logger.error("Failed to create remoteExitNode", e);
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Failed to create remoteExitNode"
                )
            );
        }
    }
}

/**
 * Validates a token received from the frontend.
 * @param {string} token The validation token from the request.
 * @returns {{ isValid: boolean; message: string }} An object indicating if the token is valid.
 */
const validateTokenOnApi = (
    token: string
): { isValid: boolean; message: string } => {
    if (!token) {
        return { isValid: false, message: "Error: No token provided." };
    }

    try {
        // 1. Decode the base64 string
        const decodedB64 = atob(token);

        // 2. Reverse the character code manipulation
        const deobfuscated = decodedB64
            .split("")
            .map((char) => String.fromCharCode(char.charCodeAt(0) - 5)) // Reverse the shift
            .join("");

        // 3. Split the data to get the original secret and timestamp
        const parts = deobfuscated.split("|");
        if (parts.length !== 2) {
            throw new Error("Invalid token format.");
        }
        const receivedKey = parts[0];
        const tokenTimestamp = parseInt(parts[1], 10);

        // 4. Check if the secret key matches
        if (receivedKey !== INSTALLER_KEY) {
            logger.info(`Token key mismatch. Received: ${receivedKey}`);
            return { isValid: false, message: "Invalid token: Key mismatch." };
        }

        // 5. Check if the timestamp is recent (e.g., within 30 seconds) to prevent replay attacks
        const now = Date.now();
        const timeDifference = now - tokenTimestamp;

        if (timeDifference > 30000) {
            // 30 seconds
            return { isValid: false, message: "Invalid token: Expired." };
        }

        if (timeDifference < 0) {
            // Timestamp is in the future
            return {
                isValid: false,
                message: "Invalid token: Timestamp is in the future."
            };
        }

        // If all checks pass, the token is valid
        return { isValid: true, message: "Token is valid!" };
    } catch (error) {
        // This will catch errors from atob (if not valid base64) or other issues.
        return {
            isValid: false,
            message: `Error: ${(error as Error).message}`
        };
    }
};
