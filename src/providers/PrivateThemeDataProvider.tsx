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

"use client";

import setGlobalColorTheme from "@app/lib/privateThemeColors";
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
