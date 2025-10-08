import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { response as sendResponse } from "@server/lib/response";
import { suppressDeprecationWarnings } from "moment";
import { supporterKey } from "@server/db";
import { db } from "@server/db";
import { eq } from "drizzle-orm";
import config from "@server/lib/config";

const validateSupporterKeySchema = z
    .object({
        githubUsername: z.string().nonempty(),
        key: z.string().nonempty()
    })
    .strict();

export type ValidateSupporterKeyResponse = {
    valid: boolean;
    githubUsername?: string;
    tier?: string;
    phrase?: string;
};

export async function validateSupporterKey(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedBody = validateSupporterKeySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { githubUsername, key } = parsedBody.data;

        const response = await fetch(
            "https://api.fossorial.io/api/v1/license/validate",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    licenseKey: key,
                    githubUsername: githubUsername
                })
            }
        );

        if (!response.ok) {
            logger.error(response);
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "An error occurred"
                )
            );
        }

        const data = await response.json();

        if (!data || !data.data.valid) {
            return sendResponse<ValidateSupporterKeyResponse>(res, {
                data: {
                    valid: false
                },
                success: true,
                error: false,
                message: "Invalid supporter key",
                status: HttpCode.OK
            });
        }

        await db.transaction(async (trx) => {
            await trx.delete(supporterKey);
            await trx.insert(supporterKey).values({
                githubUsername: githubUsername,
                key: key,
                tier: data.data.tier || null,
                phrase: data.data.cutePhrase || null,
                valid: true
            });
        });

        await config.checkSupporterKey();

        return sendResponse<ValidateSupporterKeyResponse>(res, {
            data: {
                valid: true,
                githubUsername: data.data.githubUsername,
                tier: data.data.tier,
                phrase: data.data.cutePhrase
            },
            success: true,
            error: false,
            message: "Valid supporter key",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
