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

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, sessionTransferToken } from "@server/db";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import {
    generateSessionToken,
    SESSION_COOKIE_NAME
} from "@server/auth/sessions/app";
import { encodeHexLowerCase } from "@oslojs/encoding";
import { sha256 } from "@oslojs/crypto/sha2";
import { response } from "@server/lib/response";
import { encrypt } from "@server/lib/crypto";
import config from "@server/lib/config";

const paramsSchema = z.object({}).strict();

export type GetSessionTransferTokenRenponse = {
    token: string;
};

export async function getSessionTransferToken(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { user, session } = req;

        if (!user || !session) {
            return next(createHttpError(HttpCode.UNAUTHORIZED, "Unauthorized"));
        }

        const tokenRaw = generateSessionToken();
        const token = encodeHexLowerCase(
            sha256(new TextEncoder().encode(tokenRaw))
        );

        const rawSessionId = req.cookies[SESSION_COOKIE_NAME];

        if (!rawSessionId) {
            return next(createHttpError(HttpCode.UNAUTHORIZED, "Unauthorized"));
        }

        const encryptedSession = encrypt(
            rawSessionId,
            config.getRawConfig().server.secret!
        );

        await db.insert(sessionTransferToken).values({
            encryptedSession,
            token,
            sessionId: session.sessionId,
            expiresAt: Date.now() + 30 * 1000 // Token valid for 30 seconds
        });

        return response<GetSessionTransferTokenRenponse>(res, {
            data: {
                token: tokenRaw
            },
            success: true,
            error: false,
            message: "Transfer token created successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
