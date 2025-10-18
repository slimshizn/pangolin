import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import license from "#private/license/license";
import { GetLicenseStatusResponse } from "@server/routers/license/types";

export async function getLicenseStatus(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const status = await license.check();

        return sendResponse<GetLicenseStatusResponse>(res, {
            data: status,
            success: true,
            error: false,
            message: "Got status",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
