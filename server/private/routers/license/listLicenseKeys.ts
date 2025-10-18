import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import license from "#private/license/license";
import { ListLicenseKeysResponse } from "@server/routers/license/types";

export async function listLicenseKeys(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const keys = license.listKeys();

        return sendResponse<ListLicenseKeysResponse>(res, {
            data: keys,
            success: true,
            error: false,
            message: "Successfully retrieved license keys",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
