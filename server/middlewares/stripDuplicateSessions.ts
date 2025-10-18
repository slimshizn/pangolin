import { NextFunction, Response } from "express";
import ErrorResponse from "@server/types/ErrorResponse";
import {
    SESSION_COOKIE_NAME,
    validateSessionToken
} from "@server/auth/sessions/app";

export const stripDuplicateSesions = async (
    req: any,
    res: Response<ErrorResponse>,
    next: NextFunction
) => {
    const cookieHeader: string | undefined = req.headers.cookie;
    if (!cookieHeader) {
        return next();
    }

    const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
    const sessionCookies = cookies.filter((cookie) =>
        cookie.startsWith(`${SESSION_COOKIE_NAME}=`)
    );

    const validSessions: string[] = [];
    if (sessionCookies.length > 1) {
        for (const cookie of sessionCookies) {
            const cookieValue = cookie.split("=")[1];
            const res = await validateSessionToken(cookieValue);
            if (res.session && res.user) {
                validSessions.push(cookieValue);
            }
        }

        if (validSessions.length > 0) {
            const newCookieHeader = cookies.filter((cookie) => {
                if (cookie.startsWith(`${SESSION_COOKIE_NAME}=`)) {
                    const cookieValue = cookie.split("=")[1];
                    return validSessions.includes(cookieValue);
                }
                return true;
            });
            req.headers.cookie = newCookieHeader.join("; ");
            if (req.cookies) {
                req.cookies[SESSION_COOKIE_NAME] = validSessions[0];
            }
        }
    }

    return next();
};
