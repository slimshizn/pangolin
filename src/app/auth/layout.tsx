import ProfileIcon from "@app/components/ProfileIcon";
import ThemeSwitcher from "@app/components/ThemeSwitcher";
import { Separator } from "@app/components/ui/separator";
import { priv } from "@app/lib/api";
import { verifySession } from "@app/lib/auth/verifySession";
import UserProvider from "@app/providers/UserProvider";
import { GetLicenseStatusResponse } from "@server/routers/license";
import { AxiosResponse } from "axios";
import { ExternalLink } from "lucide-react";
import { Metadata } from "next";
import { cache } from "react";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
    title: `Auth - ${process.env.BRANDING_APP_NAME || "Pangolin"}`,
    description: ""
};

type AuthLayoutProps = {
    children: React.ReactNode;
};

export default async function AuthLayout({ children }: AuthLayoutProps) {
    const getUser = cache(verifySession);
    const user = await getUser();
    const t = await getTranslations();
    const hideFooter = true;

    const licenseStatusRes = await cache(
        async () =>
            await priv.get<AxiosResponse<GetLicenseStatusResponse>>(
                "/license/status"
            )
    )();
    const licenseStatus = licenseStatusRes.data.data;

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-end items-center p-3 space-x-2">
                <ThemeSwitcher />
            </div>

            <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-md p-3">{children}</div>
            </div>

            {!(
                hideFooter || (
                licenseStatus.isHostLicensed &&
                licenseStatus.isLicenseValid)
            ) && (
                <footer className="hidden md:block w-full mt-12 py-3 mb-6 px-4">
                    <div className="container mx-auto flex flex-wrap justify-center items-center h-3 space-x-4 text-sm text-neutral-400 dark:text-neutral-600">
                        <div className="flex items-center space-x-2 whitespace-nowrap">
                            <span>Pangolin</span>
                        </div>
                        <Separator orientation="vertical" />
                        <a
                            href="https://fossorial.io/"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Built by Fossorial"
                            className="flex items-center space-x-2 whitespace-nowrap"
                        >
                            <span>Fossorial</span>
                            <ExternalLink className="w-3 h-3" />
                        </a>
                        <Separator orientation="vertical" />
                        <a
                            href="https://github.com/fosrl/pangolin"
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="GitHub"
                            className="flex items-center space-x-2 whitespace-nowrap"
                        >
                            <span>{t("communityEdition")}</span>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="w-3 h-3"
                            >
                                <path d="M12 0C5.37 0 0 5.373 0 12c0 5.303 3.438 9.8 8.207 11.385.6.11.82-.26.82-.577v-2.17c-3.338.726-4.042-1.61-4.042-1.61-.546-1.385-1.333-1.755-1.333-1.755-1.09-.744.082-.73.082-.73 1.205.085 1.84 1.24 1.84 1.24 1.07 1.835 2.807 1.305 3.492.997.107-.775.42-1.305.763-1.605-2.665-.305-5.467-1.335-5.467-5.93 0-1.31.468-2.382 1.236-3.22-.123-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.52 11.52 0 013.006-.403c1.02.005 2.045.137 3.006.403 2.29-1.552 3.295-1.23 3.295-1.23.654 1.653.242 2.873.12 3.176.77.838 1.235 1.91 1.235 3.22 0 4.605-2.805 5.623-5.475 5.92.43.37.814 1.1.814 2.22v3.293c0 .32.217.693.825.576C20.565 21.795 24 17.298 24 12 24 5.373 18.627 0 12 0z" />
                            </svg>
                        </a>
                    </div>
                </footer>
            )}
        </div>
    );
}
