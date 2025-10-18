import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { response as sendResponse } from "@server/lib/response";
import privateConfig from "@server/private/lib/config";
import { GenerateNewLicenseResponse } from "@server/routers/generatedLicense/types";

async function createNewLicense(orgId: string, licenseData: any): Promise<any> {
    try {
        const response = await fetch(
            `https://api.fossorial.io/api/v1/license-internal/enterprise/${orgId}/create`,
            {
                method: "PUT",
                headers: {
                    "api-key":
                        privateConfig.getRawPrivateConfig().server
                            .fossorial_api_key!,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(licenseData)
            }
        );

        const data = await response.json();

        logger.debug("Fossorial API response:", {data});
        return data;
    } catch (error) {
        console.error("Error creating new license:", error);
        throw error;
    }
}

export async function generateNewLicense(
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

        logger.debug(`Generating new license for orgId: ${orgId}`);

        const licenseData = req.body;
        const apiResponse = await createNewLicense(orgId, licenseData);

        return sendResponse<GenerateNewLicenseResponse>(res, {
            data: apiResponse.data,
            success: apiResponse.success,
            error: apiResponse.error,
            message: apiResponse.message,
            status: apiResponse.status
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "An error occurred while generating new license"
            )
        );
    }
}
