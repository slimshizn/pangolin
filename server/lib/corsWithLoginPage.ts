import { Request, Response, NextFunction } from "express";
import cors, { CorsOptions } from "cors";
import config from "@server/lib/config";
import logger from "@server/logger";
import { db, loginPage } from "@server/db";
import { eq } from "drizzle-orm";

async function isValidLoginPageDomain(host: string): Promise<boolean> {
    try {
        const [result] = await db
            .select()
            .from(loginPage)
            .where(eq(loginPage.fullDomain, host))
            .limit(1);

        const isValid = !!result;

        return isValid;
    } catch (error) {
        logger.error("Error checking loginPage domain:", error);
        return false;
    }
}

export function corsWithLoginPageSupport(corsConfig: any) {
    const options = {
        ...(corsConfig?.origins
            ? { origin: corsConfig.origins }
            : {
                  origin: (origin: any, callback: any) => {
                      callback(null, true);
                  }
              }),
        ...(corsConfig?.methods && { methods: corsConfig.methods }),
        ...(corsConfig?.allowed_headers && {
            allowedHeaders: corsConfig.allowed_headers
        }),
        credentials: !(corsConfig?.credentials === false)
    };

    return async (req: Request, res: Response, next: NextFunction) => {
        const originValidatedCorsConfig = {
            origin: async (
                origin: string | undefined,
                callback: (err: Error | null, allow?: boolean) => void
            ) => {
                // If no origin (e.g., same-origin request), allow it

                if (!origin) {
                    return callback(null, true);
                }

                const dashboardUrl = config.getRawConfig().app.dashboard_url;

                // If no dashboard_url is configured, allow all origins
                if (!dashboardUrl) {
                    return callback(null, true);
                }

                // Check if origin matches dashboard URL
                const dashboardHost = new URL(dashboardUrl).host;
                const originHost = new URL(origin).host;

                if (originHost === dashboardHost) {
                    return callback(null, true);
                }

                if (
                    corsConfig?.origins &&
                    corsConfig.origins.includes(origin)
                ) {
                    return callback(null, true);
                }

                // If origin doesn't match dashboard URL, check if it's a valid loginPage domain
                const isValidDomain = await isValidLoginPageDomain(originHost);

                if (isValidDomain) {
                    return callback(null, true);
                }

                // Origin is not valid
                return callback(null, false);
            },
            methods: corsConfig?.methods,
            allowedHeaders: corsConfig?.allowed_headers,
            credentials: corsConfig?.credentials !== false
        } as CorsOptions;

        return cors(originValidatedCorsConfig)(req, res, next);
    };
}
