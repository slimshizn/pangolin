"use client";

import setGlobalColorTheme from "@app/lib/themeColors";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

type ThemeColorStateProps = {
    children: React.ReactNode;
    colors: any;
};

export default function ThemeDataProvider({
    children,
    colors
}: ThemeColorStateProps) {
    const [isMounted, setIsMounted] = useState(false);
    const { theme } = useTheme();

    useEffect(() => {
        if (!colors) {
            setIsMounted(true);
            return;
        }

        let lightOrDark = theme;

        if (theme === "system" || !theme) {
            lightOrDark = window.matchMedia("(prefers-color-scheme: dark)")
                .matches
                ? "dark"
                : "light";
        }

        setGlobalColorTheme(lightOrDark as "light" | "dark", colors);

        if (!isMounted) {
            setIsMounted(true);
        }
    }, [theme]);

    if (!isMounted) {
        return null;
    }

    return <>{children}</>;
}
