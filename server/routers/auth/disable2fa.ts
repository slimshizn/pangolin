import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { db } from "@server/db";
import { User, users } from "@server/db";
import { eq } from "drizzle-orm";
import { response } from "@server/lib/response";
import { verifyPassword } from "@server/auth/password";
import { verifyTotpCode } from "@server/auth/totp";
import logger from "@server/logger";
import { sendEmail } from "@server/emails";
import TwoFactorAuthNotification from "@server/emails/templates/TwoFactorAuthNotification";
import config from "@server/lib/config";
import { unauthorized } from "@server/auth/unauthorizedResponse";
import { UserType } from "@server/types/UserTypes";

export const disable2faBody = z
    .object({
        password: z.string(),
        code: z.string().optional()
    })
    .strict();

export type Disable2faBody = z.infer<typeof disable2faBody>;

export type Disable2faResponse = {
    codeRequested?: boolean;
};

export async function disable2fa(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedBody = disable2faBody.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const { password, code } = parsedBody.data;
    const user = req.user as User;

    if (user.type !== UserType.Internal) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                "Two-factor authentication is not supported for external users"
            )
        );
    }

    try {
        const validPassword = await verifyPassword(password, user.passwordHash!);
        if (!validPassword) {
            return next(unauthorized());
        }

        if (!user.twoFactorEnabled) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Two-factor authentication is already disabled"
                )
            );
        } else {
            if (!code) {
                return response<{ codeRequested: boolean }>(res, {
                    data: { codeRequested: true },
                    success: true,
                    error: false,
                    message: "Two-factor authentication required",
                    status: HttpCode.ACCEPTED
                });
            }
        }

        const validOTP = await verifyTotpCode(
            code,
            user.twoFactorSecret!,
            user.userId
        );

        if (!validOTP) {
            if (config.getRawConfig().app.log_failed_attempts) {
                logger.info(
                    `Two-factor authentication code is incorrect. Email: ${user.email}. IP: ${req.ip}.`
                );
            }
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "The two-factor code you entered is incorrect"
                )
            );
        }

        await db
            .update(users)
            .set({ twoFactorEnabled: false })
            .where(eq(users.userId, user.userId));

        sendEmail(
            TwoFactorAuthNotification({
                email: user.email!, // email is not null because we are checking user.type
                enabled: false
            }),
            {
                to: user.email!,
                from: config.getRawConfig().email?.no_reply,
                subject: "Two-factor authentication disabled"
            }
        );

        return response<null>(res, {
            data: null,
            success: true,
            error: false,
            message: "Two-factor authentication disabled",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to disable two-factor authentication"
            )
        );
    }
}
