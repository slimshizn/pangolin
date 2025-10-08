import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, Target, targetHealthCheck, TargetHealthCheck } from "@server/db";
import { targets } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";

const getTargetSchema = z
    .object({
        targetId: z.string().transform(Number).pipe(z.number().int().positive())
    })
    .strict();

type GetTargetResponse = Target & Omit<TargetHealthCheck, 'hcHeaders'> & {
    hcHeaders: { name: string; value: string; }[] | null;
};

registry.registerPath({
    method: "get",
    path: "/target/{targetId}",
    description: "Get a target.",
    tags: [OpenAPITags.Target],
    request: {
        params: getTargetSchema
    },
    responses: {}
});

export async function getTarget(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getTargetSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { targetId } = parsedParams.data;

        const target = await db
            .select()
            .from(targets)
            .where(eq(targets.targetId, targetId))
            .limit(1);

        if (target.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Target with ID ${targetId} not found`
                )
            );
        }

        const [targetHc] = await db
            .select()
            .from(targetHealthCheck)
            .where(eq(targetHealthCheck.targetId, targetId))
            .limit(1);

        // Parse hcHeaders from JSON string back to array
        let parsedHcHeaders = null;
        if (targetHc?.hcHeaders) {
            try {
                parsedHcHeaders = JSON.parse(targetHc.hcHeaders);
            } catch (error) {
                // If parsing fails, keep as string for backward compatibility
                parsedHcHeaders = targetHc.hcHeaders;
            }
        }

        return response<GetTargetResponse>(res, {
            data: {
                ...target[0],
                ...targetHc,
                hcHeaders: parsedHcHeaders
            },
            success: true,
            error: false,
            message: "Target retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
