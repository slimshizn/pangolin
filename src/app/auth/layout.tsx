import ThemeSwitcher from "@app/components/ThemeSwitcher";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: `Auth - ${process.env.BRANDING_APP_NAME || "Pangolin"}`,
    description: ""
};

type AuthLayoutProps = {
    children: React.ReactNode;
};

export default async function AuthLayout({ children }: AuthLayoutProps) {
    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-end items-center p-3 space-x-2">
                <ThemeSwitcher />
            </div>

            <div className="flex-1 flex items-center justify-center">
                <div className="w-full max-w-md p-3">{children}</div>
            </div>
        </div>
    );
}
