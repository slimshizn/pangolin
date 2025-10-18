import createHttpError from "http-errors";
import { Request, Response, NextFunction } from "express";
import HttpCode from "@server/types/HttpCode";

export async function billingWebhookHandler(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    // return not found
    return next(
        createHttpError(HttpCode.NOT_FOUND, "This endpoint is not in use")
    );
}