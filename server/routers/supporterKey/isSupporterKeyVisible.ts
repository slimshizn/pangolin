import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import config from "@server/lib/config";
import { db } from "@server/db";
import { count } from "drizzle-orm";
import { users } from "@server/db";
import license from "@server/license/license";
import { build } from "@server/build";

export type IsSupporterKeyVisibleResponse = {
    visible: boolean;
    tier?: string;
};

const USER_LIMIT = 5;

export async function isSupporterKeyVisible(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const hidden = config.isSupporterKeyHidden();
        const key = config.getSupporterData();

        let visible = !hidden && key?.valid !== true;

        const licenseStatus = await license.check();

        if (licenseStatus.isLicenseValid) {
            visible = false;
        }

        if (key?.tier === "Limited Supporter") {
            const [numUsers] = await db.select({ count: count() }).from(users);

            if (numUsers.count > USER_LIMIT) {
                logger.debug(
                    `User count ${numUsers.count} exceeds limit ${USER_LIMIT}`
                );
                visible = true;
            }
        }

        if (config.getRawPrivateConfig().flags?.hide_supporter_key && build != "oss") {
            visible = false;
        }

        return sendResponse<IsSupporterKeyVisibleResponse>(res, {
            data: {
                visible,
                tier: key?.tier || undefined
            },
            success: true,
            error: false,
            message: "Status",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
