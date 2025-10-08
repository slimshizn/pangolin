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

import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePathname } from "next/navigation";
import Image from "next/image";

type SplashImageProps = {
    children: React.ReactNode;
};

export default function SplashImage({ children }: SplashImageProps) {
    const pathname = usePathname();
    const { env } = useEnvContext();

    function showBackgroundImage() {
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
