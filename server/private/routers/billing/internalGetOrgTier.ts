/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { getOrgTierData } from "#private/lib/billing";
import { GetOrgTierResponse } from "@server/routers/billing/types";

const getOrgSchema = z
    .object({
        orgId: z.string()
    })
    .strict();

export async function getOrgTier(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getOrgSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const { orgId } = parsedParams.data;

        let tierData = null;
        let activeData = false;

        try {
            const { tier, active } = await getOrgTierData(orgId);
            tierData = tier;
            activeData = active;
        } catch (err) {
            if ((err as Error).message === "Not found") {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Organization with ID ${orgId} not found`
                    )
                );
            }
            throw err;
        }

        return response<GetOrgTierResponse>(res, {
            data: {
                tier: tierData,
                active: activeData
            },
            success: true,
            error: false,
            message: "Organization and subscription retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
