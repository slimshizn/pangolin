import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import privateConfig from "@server/private/lib/config";
import { GeneratedLicenseKey, ListGeneratedLicenseKeysResponse } from "@server/routers/generatedLicense/types";

async function fetchLicenseKeys(orgId: string): Promise<any> {
    try {
        const response = await fetch(
            `https://api.fossorial.io/api/v1/license-internal/enterprise/${orgId}/list`,
            {
                method: "GET",
                headers: {
                    "api-key":
                        privateConfig.getRawPrivateConfig().server
                            .fossorial_api_key!,
                    "Content-Type": "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Error fetching license keys:", error);
        throw error;
    }
}

export async function listSaasLicenseKeys(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const { orgId } = req.params;

        if (!orgId) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Organization ID is required"
                )
            );
        }

        const apiResponse = await fetchLicenseKeys(orgId);
        const keys: GeneratedLicenseKey[] = apiResponse.data.licenseKeys || [];

        return sendResponse<ListGeneratedLicenseKeysResponse>(res, {
            data: keys,
            success: true,
            error: false,
            message: "Successfully retrieved license keys",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred while fetching license keys"
            )
        );
    }
}
