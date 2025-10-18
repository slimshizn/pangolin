import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import config from "@server/lib/config";

export type HideSupporterKeyResponse = {
    hidden: boolean;
};

export async function hideSupporterKey(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        config.hideSupporterKey();

        return sendResponse<HideSupporterKeyResponse>(res, {
            data: {
                hidden: true
            },
            success: true,
            error: false,
            message: "Hidden",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
