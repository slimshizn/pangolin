import { NextFunction, Request, Response } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response } from "@server/lib/response";
import { db, users } from "@server/db";
import { eq } from "drizzle-orm";

export type InitialSetupCompleteResponse = {
    complete: boolean;
};

export async function initialSetupComplete(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const [existing] = await db
            .select()
            .from(users)
            .where(eq(users.serverAdmin, true));

        return response<InitialSetupCompleteResponse>(res, {
            data: {
                complete: !!existing
            },
            success: true,
            error: false,
            message: "Initial setup check completed",
            status: HttpCode.OK
        });
    } catch (e) {
        logger.error(e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to check initial setup completion"
            )
        );
    }
}
