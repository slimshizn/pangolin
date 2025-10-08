import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import license, { LicenseStatus } from "@server/license/license";

export type RecheckStatusResponse = LicenseStatus;

export async function recheckStatus(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        try {
            const status = await license.forceRecheck();
            return sendResponse(res, {
                data: status,
                success: true,
                error: false,
                message: "License status rechecked successfully",
                status: HttpCode.OK
            });
        } catch (e) {
            logger.error(e);
            return next(
                createHttpError(HttpCode.INTERNAL_SERVER_ERROR, `${e}`)
            );
        }
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
