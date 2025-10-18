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

import { z } from "zod";
import { __DIRNAME } from "@server/lib/consts";
import { SupporterKey } from "@server/db";
import { fromError } from "zod-validation-error";
import {
    privateConfigSchema,
    readPrivateConfigFile
} from "#private/lib/readConfigFile";

export class PrivateConfig {
    private rawPrivateConfig!: z.infer<typeof privateConfigSchema>;

    supporterData: SupporterKey | null = null;

    supporterHiddenUntil: number | null = null;

    isDev: boolean = process.env.ENVIRONMENT !== "prod";

    constructor() {
        const privateEnvironment = readPrivateConfigFile();

        const {
            data: parsedPrivateConfig,
            success: privateSuccess,
            error: privateError
        } = privateConfigSchema.safeParse(privateEnvironment);

        if (!privateSuccess) {
            const errors = fromError(privateError);
            throw new Error(`Invalid private configuration file: ${errors}`);
        }

        this.rawPrivateConfig = parsedPrivateConfig;

        if (this.rawPrivateConfig.branding?.colors) {
            process.env.BRANDING_COLORS = JSON.stringify(
                this.rawPrivateConfig.branding?.colors
            );
        }

        if (this.rawPrivateConfig.branding?.logo?.light_path) {
            process.env.BRANDING_LOGO_LIGHT_PATH =
                this.rawPrivateConfig.branding?.logo?.light_path;
        }
        if (this.rawPrivateConfig.branding?.logo?.dark_path) {
            process.env.BRANDING_LOGO_DARK_PATH =
                this.rawPrivateConfig.branding?.logo?.dark_path || undefined;
        }

        process.env.BRANDING_LOGO_AUTH_WIDTH = this.rawPrivateConfig.branding
            ?.logo?.auth_page?.width
            ? this.rawPrivateConfig.branding?.logo?.auth_page?.width.toString()
            : undefined;
        process.env.BRANDING_LOGO_AUTH_HEIGHT = this.rawPrivateConfig.branding
            ?.logo?.auth_page?.height
            ? this.rawPrivateConfig.branding?.logo?.auth_page?.height.toString()
            : undefined;

        process.env.BRANDING_LOGO_NAVBAR_WIDTH = this.rawPrivateConfig.branding
            ?.logo?.navbar?.width
            ? this.rawPrivateConfig.branding?.logo?.navbar?.width.toString()
            : undefined;
        process.env.BRANDING_LOGO_NAVBAR_HEIGHT = this.rawPrivateConfig.branding
            ?.logo?.navbar?.height
            ? this.rawPrivateConfig.branding?.logo?.navbar?.height.toString()
            : undefined;

        process.env.BRANDING_FAVICON_PATH =
            this.rawPrivateConfig.branding?.favicon_path;

        process.env.BRANDING_APP_NAME =
            this.rawPrivateConfig.branding?.app_name || "Pangolin";

        if (this.rawPrivateConfig.branding?.footer) {
            process.env.BRANDING_FOOTER = JSON.stringify(
                this.rawPrivateConfig.branding?.footer
            );
        }

        process.env.LOGIN_PAGE_TITLE_TEXT =
            this.rawPrivateConfig.branding?.login_page?.title_text || "";
        process.env.LOGIN_PAGE_SUBTITLE_TEXT =
            this.rawPrivateConfig.branding?.login_page?.subtitle_text || "";

        process.env.SIGNUP_PAGE_TITLE_TEXT =
            this.rawPrivateConfig.branding?.signup_page?.title_text || "";
        process.env.SIGNUP_PAGE_SUBTITLE_TEXT =
            this.rawPrivateConfig.branding?.signup_page?.subtitle_text || "";

        process.env.RESOURCE_AUTH_PAGE_HIDE_POWERED_BY =
            this.rawPrivateConfig.branding?.resource_auth_page
                ?.hide_powered_by === true
                ? "true"
                : "false";
        process.env.RESOURCE_AUTH_PAGE_SHOW_LOGO =
            this.rawPrivateConfig.branding?.resource_auth_page?.show_logo ===
            true
                ? "true"
                : "false";
        process.env.RESOURCE_AUTH_PAGE_TITLE_TEXT =
            this.rawPrivateConfig.branding?.resource_auth_page?.title_text ||
            "";
        process.env.RESOURCE_AUTH_PAGE_SUBTITLE_TEXT =
            this.rawPrivateConfig.branding?.resource_auth_page?.subtitle_text ||
            "";

        if (this.rawPrivateConfig.branding?.background_image_path) {
            process.env.BACKGROUND_IMAGE_PATH =
                this.rawPrivateConfig.branding?.background_image_path;
        }

        if (this.rawPrivateConfig.server.reo_client_id) {
            process.env.REO_CLIENT_ID =
                this.rawPrivateConfig.server.reo_client_id;
        }

        if (this.rawPrivateConfig.stripe?.s3Bucket) {
            process.env.S3_BUCKET = this.rawPrivateConfig.stripe.s3Bucket;
        }
        if (this.rawPrivateConfig.stripe?.localFilePath) {
            process.env.LOCAL_FILE_PATH =
                this.rawPrivateConfig.stripe.localFilePath;
        }
        if (this.rawPrivateConfig.stripe?.s3Region) {
            process.env.S3_REGION = this.rawPrivateConfig.stripe.s3Region;
        }
        if (this.rawPrivateConfig.flags.use_pangolin_dns) {
            process.env.USE_PANGOLIN_DNS =
                this.rawPrivateConfig.flags.use_pangolin_dns.toString();
        }
    }

    public getRawPrivateConfig() {
        return this.rawPrivateConfig;
    }
}

export const privateConfig = new PrivateConfig();

export default privateConfig;
