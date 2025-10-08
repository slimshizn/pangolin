import { z } from "zod";
import { __DIRNAME, APP_VERSION } from "@server/lib/consts";
import { db } from "@server/db";
import { SupporterKey, supporterKey } from "@server/db";
import { eq } from "drizzle-orm";
import { license } from "@server/license/license";
import { configSchema, readConfigFile } from "./readConfigFile";
import { fromError } from "zod-validation-error";
import {
    privateConfigSchema,
    readPrivateConfigFile
} from "@server/lib/private/readConfigFile";
import logger from "@server/logger";
import { build } from "@server/build";

export class Config {
    private rawConfig!: z.infer<typeof configSchema>;
    private rawPrivateConfig!: z.infer<typeof privateConfigSchema>;

    supporterData: SupporterKey | null = null;

    supporterHiddenUntil: number | null = null;

    isDev: boolean = process.env.ENVIRONMENT !== "prod";

    constructor() {
        const environment = readConfigFile();

        const {
            data: parsedConfig,
            success,
            error
        } = configSchema.safeParse(environment);

        if (!success) {
            const errors = fromError(error);
            throw new Error(`Invalid configuration file: ${errors}`);
        }

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

        if (
            // @ts-ignore
            parsedConfig.users ||
            process.env.USERS_SERVERADMIN_EMAIL ||
            process.env.USERS_SERVERADMIN_PASSWORD
        ) {
            console.log(
                "WARNING: Your admin credentials are still in the config file or environment variables. This method of setting admin credentials is no longer supported. It is recommended to remove them."
            );
        }

        process.env.APP_VERSION = APP_VERSION;

        process.env.NEXT_PORT = parsedConfig.server.next_port.toString();
        process.env.SERVER_EXTERNAL_PORT =
            parsedConfig.server.external_port.toString();
        process.env.SERVER_INTERNAL_PORT =
            parsedConfig.server.internal_port.toString();
        process.env.FLAGS_EMAIL_VERIFICATION_REQUIRED = parsedConfig.flags
            ?.require_email_verification
            ? "true"
            : "false";
        process.env.FLAGS_ALLOW_RAW_RESOURCES = parsedConfig.flags
            ?.allow_raw_resources
            ? "true"
            : "false";
        process.env.SESSION_COOKIE_NAME =
            parsedConfig.server.session_cookie_name;
        process.env.EMAIL_ENABLED = parsedConfig.email ? "true" : "false";
        process.env.DISABLE_SIGNUP_WITHOUT_INVITE = parsedConfig.flags
            ?.disable_signup_without_invite
            ? "true"
            : "false";
        process.env.DISABLE_USER_CREATE_ORG = parsedConfig.flags
            ?.disable_user_create_org
            ? "true"
            : "false";
        process.env.RESOURCE_ACCESS_TOKEN_PARAM =
            parsedConfig.server.resource_access_token_param;
        process.env.RESOURCE_ACCESS_TOKEN_HEADERS_ID =
            parsedConfig.server.resource_access_token_headers.id;
        process.env.RESOURCE_ACCESS_TOKEN_HEADERS_TOKEN =
            parsedConfig.server.resource_access_token_headers.token;
        process.env.RESOURCE_SESSION_REQUEST_PARAM =
            parsedConfig.server.resource_session_request_param;
        process.env.DASHBOARD_URL = parsedConfig.app.dashboard_url;
        process.env.FLAGS_DISABLE_LOCAL_SITES = parsedConfig.flags
            ?.disable_local_sites
            ? "true"
            : "false";
        process.env.FLAGS_DISABLE_BASIC_WIREGUARD_SITES = parsedConfig.flags
            ?.disable_basic_wireguard_sites
            ? "true"
            : "false";

        process.env.FLAGS_ENABLE_CLIENTS = parsedConfig.flags?.enable_clients
            ? "true"
            : "false";

        if (parsedPrivateConfig.branding?.colors) {
            process.env.BRANDING_COLORS = JSON.stringify(
                parsedPrivateConfig.branding?.colors
            );
        }

        if (parsedPrivateConfig.branding?.logo?.light_path) {
            process.env.BRANDING_LOGO_LIGHT_PATH =
                parsedPrivateConfig.branding?.logo?.light_path;
        }
        if (parsedPrivateConfig.branding?.logo?.dark_path) {
            process.env.BRANDING_LOGO_DARK_PATH =
                parsedPrivateConfig.branding?.logo?.dark_path || undefined;
        }

        process.env.HIDE_SUPPORTER_KEY = parsedPrivateConfig.flags
            ?.hide_supporter_key
            ? "true"
            : "false";

        if (build != "oss") {
            if (parsedPrivateConfig.branding?.logo?.light_path) {
                process.env.BRANDING_LOGO_LIGHT_PATH =
                    parsedPrivateConfig.branding?.logo?.light_path;
            }
            if (parsedPrivateConfig.branding?.logo?.dark_path) {
                process.env.BRANDING_LOGO_DARK_PATH =
                    parsedPrivateConfig.branding?.logo?.dark_path || undefined;
            }

            process.env.BRANDING_LOGO_AUTH_WIDTH = parsedPrivateConfig.branding
                ?.logo?.auth_page?.width
                ? parsedPrivateConfig.branding?.logo?.auth_page?.width.toString()
                : undefined;
            process.env.BRANDING_LOGO_AUTH_HEIGHT = parsedPrivateConfig.branding
                ?.logo?.auth_page?.height
                ? parsedPrivateConfig.branding?.logo?.auth_page?.height.toString()
                : undefined;

            process.env.BRANDING_LOGO_NAVBAR_WIDTH = parsedPrivateConfig
                .branding?.logo?.navbar?.width
                ? parsedPrivateConfig.branding?.logo?.navbar?.width.toString()
                : undefined;
            process.env.BRANDING_LOGO_NAVBAR_HEIGHT = parsedPrivateConfig
                .branding?.logo?.navbar?.height
                ? parsedPrivateConfig.branding?.logo?.navbar?.height.toString()
                : undefined;

            process.env.BRANDING_FAVICON_PATH =
                parsedPrivateConfig.branding?.favicon_path;

            process.env.BRANDING_APP_NAME =
                parsedPrivateConfig.branding?.app_name || "Pangolin";

            if (parsedPrivateConfig.branding?.footer) {
                process.env.BRANDING_FOOTER = JSON.stringify(
                    parsedPrivateConfig.branding?.footer
                );
            }

            process.env.LOGIN_PAGE_TITLE_TEXT =
                parsedPrivateConfig.branding?.login_page?.title_text || "";
            process.env.LOGIN_PAGE_SUBTITLE_TEXT =
                parsedPrivateConfig.branding?.login_page?.subtitle_text || "";

            process.env.SIGNUP_PAGE_TITLE_TEXT =
                parsedPrivateConfig.branding?.signup_page?.title_text || "";
            process.env.SIGNUP_PAGE_SUBTITLE_TEXT =
                parsedPrivateConfig.branding?.signup_page?.subtitle_text || "";

            process.env.RESOURCE_AUTH_PAGE_HIDE_POWERED_BY =
                parsedPrivateConfig.branding?.resource_auth_page
                    ?.hide_powered_by === true
                    ? "true"
                    : "false";
            process.env.RESOURCE_AUTH_PAGE_SHOW_LOGO =
                parsedPrivateConfig.branding?.resource_auth_page?.show_logo ===
                true
                    ? "true"
                    : "false";
            process.env.RESOURCE_AUTH_PAGE_TITLE_TEXT =
                parsedPrivateConfig.branding?.resource_auth_page?.title_text ||
                "";
            process.env.RESOURCE_AUTH_PAGE_SUBTITLE_TEXT =
                parsedPrivateConfig.branding?.resource_auth_page
                    ?.subtitle_text || "";

            if (parsedPrivateConfig.branding?.background_image_path) {
                process.env.BACKGROUND_IMAGE_PATH =
                    parsedPrivateConfig.branding?.background_image_path;
            }

            if (parsedPrivateConfig.server.reo_client_id) {
                process.env.REO_CLIENT_ID =
                    parsedPrivateConfig.server.reo_client_id;
            }
        }

        if (parsedConfig.server.maxmind_db_path) {
            process.env.MAXMIND_DB_PATH = parsedConfig.server.maxmind_db_path;
        }

        this.rawConfig = parsedConfig;
        this.rawPrivateConfig = parsedPrivateConfig;
    }

    public async initServer() {
        if (!this.rawConfig) {
            throw new Error("Config not loaded. Call load() first.");
        }
        if (this.rawConfig.managed) {
            // LETS NOT WORRY ABOUT THE SERVER SECRET WHEN MANAGED
            return;
        }
        license.setServerSecret(this.rawConfig.server.secret!);

        await this.checkKeyStatus();
    }

    private async checkKeyStatus() {
        const licenseStatus = await license.check();
        if (
            !this.rawPrivateConfig.flags?.hide_supporter_key &&
            build != "oss" &&
            !licenseStatus.isHostLicensed
        ) {
            this.checkSupporterKey();
        }
    }

    public getRawConfig() {
        return this.rawConfig;
    }

    public getRawPrivateConfig() {
        return this.rawPrivateConfig;
    }

    public getNoReplyEmail(): string | undefined {
        return (
            this.rawConfig.email?.no_reply || this.rawConfig.email?.smtp_user
        );
    }

    public getDomain(domainId: string) {
        if (!this.rawConfig.domains || !this.rawConfig.domains[domainId]) {
            return null;
        }
        return this.rawConfig.domains[domainId];
    }

    public hideSupporterKey(days: number = 7) {
        const now = new Date().getTime();

        if (this.supporterHiddenUntil && now < this.supporterHiddenUntil) {
            return;
        }

        this.supporterHiddenUntil = now + 1000 * 60 * 60 * 24 * days;
    }

    public isSupporterKeyHidden() {
        const now = new Date().getTime();

        if (this.supporterHiddenUntil && now < this.supporterHiddenUntil) {
            return true;
        }

        return false;
    }

    public isManagedMode() {
        return typeof this.rawConfig?.managed === "object";
    }

    public async checkSupporterKey() {
        const [key] = await db.select().from(supporterKey).limit(1);

        if (!key) {
            return;
        }

        const { key: licenseKey, githubUsername } = key;

        try {
            const response = await fetch(
                "https://api.fossorial.io/api/v1/license/validate",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        licenseKey,
                        githubUsername
                    })
                }
            );

            if (!response.ok) {
                this.supporterData = key;
                return;
            }

            const data = await response.json();

            if (!data.data.valid) {
                this.supporterData = {
                    ...key,
                    valid: false
                };
                return;
            }

            this.supporterData = {
                ...key,
                tier: data.data.tier,
                valid: true
            };

            // update the supporter key in the database
            await db
                .update(supporterKey)
                .set({
                    tier: data.data.tier || null,
                    phrase: data.data.cutePhrase || null,
                    valid: true
                })
                .where(eq(supporterKey.keyId, key.keyId));
        } catch (e) {
            this.supporterData = key;
            console.error("Failed to validate supporter key", e);
        }
    }

    public getSupporterData() {
        return this.supporterData;
    }
}

export const config = new Config();

export default config;
