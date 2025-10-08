import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import HttpCode from "@server/types/HttpCode";
import { response } from "@server/lib/response";
import { db, userOrgs } from "@server/db";
import { User, emailVerificationCodes, users } from "@server/db";
import { eq } from "drizzle-orm";
import { isWithinExpirationDate } from "oslo";
import config from "@server/lib/config";
import logger from "@server/logger";
import { freeLimitSet, limitsService } from "@server/lib/private/billing";
import { build } from "@server/build";

export const verifyEmailBody = z
    .object({
        code: z.string()
    })
    .strict();

export type VerifyEmailBody = z.infer<typeof verifyEmailBody>;

export type VerifyEmailResponse = {
    valid: boolean;
};

export async function verifyEmail(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    if (!config.getRawConfig().flags?.require_email_verification) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                "Email verification is not enabled"
            )
        );
    }

    const parsedBody = verifyEmailBody.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const { code } = parsedBody.data;

    const user = req.user as User;

    if (user.emailVerified) {
        return next(
            createHttpError(HttpCode.BAD_REQUEST, "Email is already verified")
        );
    }

    try {
        const valid = await isValidCode(user, code);

        if (valid) {
            await db.transaction(async (trx) => {
                await trx
                    .delete(emailVerificationCodes)
                    .where(eq(emailVerificationCodes.userId, user.userId));

                await trx
                    .update(users)
                    .set({
                        emailVerified: true
                    })
                    .where(eq(users.userId, user.userId));
            });
        } else {
            if (config.getRawConfig().app.log_failed_attempts) {
                logger.info(
                    `Email verification code incorrect. Email: ${user.email}. IP: ${req.ip}.`
                );
            }
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Invalid verification code"
                )
            );
        }

        if (build == "saas") {
            const orgs = await db
                .select()
                .from(userOrgs)
                .where(eq(userOrgs.userId, user.userId));
            const orgIds = orgs.map((org) => org.orgId);
            await Promise.all(
                orgIds.map(async (orgId) => {
                    await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
                })
            );
        }

        return response<VerifyEmailResponse>(res, {
            success: true,
            error: false,
            message: "Email verified",
            status: HttpCode.OK,
            data: {
                valid
            }
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to verify email"
            )
        );
    }
}

export default verifyEmail;

async function isValidCode(user: User, code: string): Promise<boolean> {
    const codeRecord = await db
        .select()
        .from(emailVerificationCodes)
        .where(eq(emailVerificationCodes.userId, user.userId))
        .limit(1);

    if (user.email !== codeRecord[0].email) {
        return false;
    }

    if (codeRecord.length === 0) {
        return false;
    }

    if (codeRecord[0].code !== code) {
        return false;
    }

    if (!isWithinExpirationDate(new Date(codeRecord[0].expiresAt))) {
        return false;
    }

    return true;
}
