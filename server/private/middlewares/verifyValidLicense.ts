import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import license from "#private/license/license";
import { build } from "@server/build";

export async function verifyValidLicense(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        if (build != "enterprise") {
            return next();
        }

        const unlocked = await license.isUnlocked();
        if (!unlocked) {
            return next(
                createHttpError(HttpCode.FORBIDDEN, "License is not valid")
            );
        }

        return next();
    } catch (e) {
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error verifying license"
            )
        );
    }
}
