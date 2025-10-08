export type Env = {
    app: {
        environment: string;
        sandbox_mode: boolean;
        version: string;
        dashboardUrl: string;
    };
    server: {
        externalPort: string;
        nextPort: string;
        sessionCookieName: string;
        resourceAccessTokenParam: string;
        resourceSessionRequestParam: string;
        resourceAccessTokenHeadersId: string;
        resourceAccessTokenHeadersToken: string;
        reoClientId?: string;
        maxmind_db_path?: string;
    };
    email: {
        emailEnabled: boolean;
    };
    flags: {
        disableSignupWithoutInvite: boolean;
        disableUserCreateOrg: boolean;
        emailVerificationRequired: boolean;
        allowRawResources: boolean;
        disableLocalSites: boolean;
        disableBasicWireguardSites: boolean;
        enableClients: boolean;
        hideSupporterKey: boolean;
    },
    branding: {
        appName?: string;
        background_image_path?: string;
        logo?: {
            lightPath?: string;
            darkPath?: string;
            authPage?: {
                width?: number;
                height?: number;
            };
            navbar?: {
                width?: number;
                height?: number;
            }
        },
        loginPage?: {
            titleText?: string;
            subtitleText?: string;
        },
        signupPage?: {
            titleText?: string;
            subtitleText?: string;
        },
        resourceAuthPage?: {
            showLogo?: boolean;
            hidePoweredBy?: boolean;
            titleText?: string;
            subtitleText?: string;
        },
        footer?: string;
    };
};
