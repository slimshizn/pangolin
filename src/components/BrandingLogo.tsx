"use client";

import { useEnvContext } from "@app/hooks/useEnvContext";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import { useTheme } from "next-themes";
import Image from "next/image";
import { useEffect, useState } from "react";

type BrandingLogoProps = {
    width: number;
    height: number;
};

export default function BrandingLogo(props: BrandingLogoProps) {
    const { env } = useEnvContext();
    const { theme } = useTheme();
    const { isUnlocked } = useLicenseStatusContext();
    const [path, setPath] = useState<string>(""); // Default logo path

    useEffect(() => {
        function getPath() {
            let lightOrDark = theme;

            if (theme === "system" || !theme) {
                lightOrDark = window.matchMedia("(prefers-color-scheme: dark)")
                    .matches
                    ? "dark"
                    : "light";
            }

            if (lightOrDark === "light") {
                if (isUnlocked() && env.branding.logo?.lightPath) {
                    return env.branding.logo.lightPath;
                }
                return "/logo/word_mark_black.png";
            }

            if (isUnlocked() && env.branding.logo?.darkPath) {
                return env.branding.logo.darkPath;
            }
            return  "/logo/word_mark_white.png";
        }

        const path = getPath();
        setPath(path);
    }, [theme, env]);

    return (
        path && (
            <Image
                src={path}
                alt="Logo"
                width={props.width}
                height={props.height}
            />
        )
    );
}
