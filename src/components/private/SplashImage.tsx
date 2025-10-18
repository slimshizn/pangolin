"use client";

import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";

type SplashImageProps = {
    children: React.ReactNode;
};

export default function SplashImage({ children }: SplashImageProps) {
    const pathname = usePathname();
    const { env } = useEnvContext();
    const { isUnlocked } = useLicenseStatusContext();

    function showBackgroundImage() {
        if (!isUnlocked()) {
            return false;
        }
        if (!env.branding.background_image_path) {
            return false;
        }
        const pathsPrefixes = ["/auth/login", "/auth/signup", "/auth/resource"];
        for (const prefix of pathsPrefixes) {
            if (pathname.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    return (
        <>
            {showBackgroundImage() && (
                <Image
                    src={env.branding.background_image_path!}
                    alt="Background"
                    layout="fill"
                    objectFit="cover"
                    quality={100}
                    className="-z-10"
                />
            )}

            {children}
        </>
    );
}
