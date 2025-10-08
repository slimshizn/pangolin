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
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { redirect, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { TransferSessionResponse } from "@server/routers/auth/privateTransferSession";

type ValidateSessionTransferTokenParams = {
    token: string;
};

export default function ValidateSessionTransferToken(
    props: ValidateSessionTransferTokenParams
) {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const t = useTranslations();

    useEffect(() => {
        async function validate() {
            setLoading(true);

            let doRedirect = false;
            try {
                const res = await api.post<
                    AxiosResponse<TransferSessionResponse>
                >(`/auth/transfer-session-token`, {
                    token: props.token
                });

                if (res && res.status === 200) {
                    doRedirect = true;
                }
            } catch (e) {
                console.error(e);
                setError(formatAxiosError(e, "Failed to validate token"));
            } finally {
                setLoading(false);
            }

            if (doRedirect) {
                redirect(env.app.dashboardUrl);
            }
        }

        validate();
    }, []);

    return (
        <div className="flex items-center justify-center min-h-screen">
            {error && (
                <Alert variant="destructive" className="w-full">
                    <AlertCircle className="h-5 w-5" />
                    <AlertDescription className="flex flex-col space-y-2">
                        <span className="text-xs">{error}</span>
                    </AlertDescription>
                </Alert>
            )}
        </div>
    );
}
