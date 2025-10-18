import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { encodeHex } from "oslo/encoding";
import HttpCode from "@server/types/HttpCode";
import { response } from "@server/lib/response";
import { db } from "@server/db";
import { User, users } from "@server/db";
import { eq, and } from "drizzle-orm";
import { createTOTPKeyURI } from "oslo/otp";
import logger from "@server/logger";
import { verifyPassword } from "@server/auth/password";
import { unauthorized } from "@server/auth/unauthorizedResponse";
import { UserType } from "@server/types/UserTypes";
import { verifySession } from "@server/auth/sessions/verifySession";
import config from "@server/lib/config";

export const requestTotpSecretBody = z
    .object({
        password: z.string(),
        email: z.string().email().optional()
    })
    .strict();

export type RequestTotpSecretBody = z.infer<typeof requestTotpSecretBody>;

export type RequestTotpSecretResponse = {
    secret: string;
    uri: string;
};

export async function requestTotpSecret(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    const parsedBody = requestTotpSecretBody.safeParse(req.body);

    if (!parsedBody.success) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                fromError(parsedBody.error).toString()
            )
        );
    }

    const { password, email } = parsedBody.data;

    const { user: sessionUser, session: existingSession } = await verifySession(req);

    let user: User | null = sessionUser;
    if (!existingSession) {
        if (!email) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Email is required for two-factor authentication setup"
                )
            );
        }
        const [res] = await db
            .select()
            .from(users)
            .where(
                and(eq(users.type, UserType.Internal), eq(users.email, email))
            );
        user = res;
    }

    if (!user) {
        if (config.getRawConfig().app.log_failed_attempts) {
            logger.info(
                `Username or password incorrect. Email: ${email}. IP: ${req.ip}.`
            );
        }
        return next(
            createHttpError(
                HttpCode.UNAUTHORIZED,
                "Username or password is incorrect"
            )
        );
    }

    if (user.type !== UserType.Internal) {
        return next(
            createHttpError(
                HttpCode.BAD_REQUEST,
                "Two-factor authentication is not supported for external users"
            )
        );
    }

    try {
        const validPassword = await verifyPassword(
            password,
            user.passwordHash!
        );
        if (!validPassword) {
            return next(unauthorized());
        }

        if (user.twoFactorEnabled) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "User has already enabled two-factor authentication"
                )
            );
        }

        const appName = process.env.BRANDING_APP_NAME || "Pangolin"; // From the private config loading into env vars to seperate away the private config

        const hex = crypto.getRandomValues(new Uint8Array(20));
        const secret = encodeHex(hex);
        const uri = createTOTPKeyURI(
            appName,
            user.email!,
            hex
        );

        await db
            .update(users)
            .set({
                twoFactorSecret: secret
            })
            .where(eq(users.userId, user.userId));

        return response<RequestTotpSecretResponse>(res, {
            data: {
                secret,
                uri
            },
            success: true,
            error: false,
            message: "TOTP secret generated successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to generate TOTP secret"
            )
        );
    }
}
