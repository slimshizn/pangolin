"use client";

import { useState, forwardRef, useImperativeHandle, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2 } from "lucide-react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { AxiosResponse } from "axios";
import {
    LoginResponse,
    RequestTotpSecretBody,
    RequestTotpSecretResponse,
    VerifyTotpBody,
    VerifyTotpResponse
} from "@server/routers/auth";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { toast } from "@app/hooks/useToast";
import { formatAxiosError } from "@app/lib/api";
import CopyTextBox from "@app/components/CopyTextBox";
import { QRCodeCanvas } from "qrcode.react";
import { useUserContext } from "@app/hooks/useUserContext";
import { useTranslations } from "next-intl";

type TwoFactorSetupFormProps = {
    onComplete?: (email: string, password: string) => void;
    onCancel?: () => void;
    isDialog?: boolean;
    email?: string;
    password?: string;
    submitButtonText?: string;
    cancelButtonText?: string;
    showCancelButton?: boolean;
    onStepChange?: (step: number) => void;
    onLoadingChange?: (loading: boolean) => void;
};

const TwoFactorSetupForm = forwardRef<
    { handleSubmit: () => void },
    TwoFactorSetupFormProps
>(
    (
        {
            onComplete,
            onCancel,
            isDialog = false,
            email,
            password: initialPassword,
            submitButtonText,
            cancelButtonText,
            showCancelButton = false,
            onStepChange,
            onLoadingChange
        },
        ref
    ) => {
        const [step, setStep] = useState(1);
        const [secretKey, setSecretKey] = useState("");
        const [secretUri, setSecretUri] = useState("");
        const [loading, setLoading] = useState(false);
        const [backupCodes, setBackupCodes] = useState<string[]>([]);

        const api = createApiClient(useEnvContext());
        const t = useTranslations();

        // Notify parent of step and loading changes
        useEffect(() => {
            onStepChange?.(step);
        }, [step, onStepChange]);

        useEffect(() => {
            onLoadingChange?.(loading);
        }, [loading, onLoadingChange]);

        const enableSchema = z.object({
            password: z.string().min(1, { message: t("passwordRequired") })
        });

        const confirmSchema = z.object({
            code: z.string().length(6, { message: t("pincodeInvalid") })
        });

        const enableForm = useForm({
            resolver: zodResolver(enableSchema),
            defaultValues: {
                password: initialPassword || ""
            }
        });

        const confirmForm = useForm({
            resolver: zodResolver(confirmSchema),
            defaultValues: {
                code: ""
            }
        });

        const request2fa = async (values: z.infer<typeof enableSchema>) => {
            setLoading(true);

            const endpoint = `/auth/2fa/request`;
            const payload = { email, password: values.password };

            const res = await api
                .post<
                    AxiosResponse<RequestTotpSecretResponse>
                >(endpoint, payload)
                .catch((e) => {
                    toast({
                        title: t("otpErrorEnable"),
                        description: formatAxiosError(
                            e,
                            t("otpErrorEnableDescription")
                        ),
                        variant: "destructive"
                    });
                });

            if (res && res.data.data.secret) {
                setSecretKey(res.data.data.secret);
                setSecretUri(res.data.data.uri);
                setStep(2);
            }

            setLoading(false);
        };

        const confirm2fa = async (values: z.infer<typeof confirmSchema>) => {
            setLoading(true);

            const endpoint = `/auth/2fa/enable`;
            const payload = {
                email,
                password: enableForm.getValues().password,
                code: values.code
            };

            const res = await api
                .post<AxiosResponse<VerifyTotpResponse>>(endpoint, payload)
                .catch((e) => {
                    toast({
                        title: t("otpErrorEnable"),
                        description: formatAxiosError(
                            e,
                            t("otpErrorEnableDescription")
                        ),
                        variant: "destructive"
                    });
                });

            if (res && res.data.data.valid) {
                setBackupCodes(res.data.data.backupCodes || []);
                await api
                    .post<AxiosResponse<LoginResponse>>("/auth/login", {
                        email,
                        password: enableForm.getValues().password,
                        code: values.code
                    })
                    .catch((e) => {
                        console.error(e);
                    });
                setStep(3);
            }

            setLoading(false);
        };

        const handleSubmit = () => {
            if (step === 1) {
                enableForm.handleSubmit(request2fa)();
            } else if (step === 2) {
                confirmForm.handleSubmit(confirm2fa)();
            }
        };

        const handleComplete = (email: string, password: string) => {
            if (onComplete) {
                onComplete(email, password);
            }
        };

        useImperativeHandle(ref, () => ({
            handleSubmit
        }));

        return (
            <div className="space-y-4">
                {step === 1 && (
                    <Form {...enableForm}>
                        <form
                            onSubmit={enableForm.handleSubmit(request2fa)}
                            className="space-y-4"
                            id="form"
                        >
                            <div className="space-y-4">
                                <FormField
                                    control={enableForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("password")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </form>
                    </Form>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <p>{t("otpSetupScanQr")}</p>
                        <div className="h-[250px] mx-auto flex items-center justify-center">
                            <div className="bg-white p-6 border rounded-md">
                            <QRCodeCanvas value={secretUri} size={200} />
                            </div>
                        </div>
                        <div className="max-w-md mx-auto">
                            <CopyTextBox text={secretUri} wrapText={false} />
                        </div>

                        <Form {...confirmForm}>
                            <form
                                onSubmit={confirmForm.handleSubmit(confirm2fa)}
                                className="space-y-4"
                                id="form"
                            >
                                <FormField
                                    control={confirmForm.control}
                                    name="code"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                {t("otpSetupSecretCode")}
                                            </FormLabel>
                                            <FormControl>
                                                <Input type="code" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </div>
                )}

                {step === 3 && (
                    <div className="space-y-4 text-center">
                        <CheckCircle2
                            className="mx-auto text-green-500"
                            size={48}
                        />
                        <p className="font-semibold text-lg">
                            {t("otpSetupSuccess")}
                        </p>
                        <p>{t("otpSetupSuccessStoreBackupCodes")}</p>

                        {backupCodes.length > 0 && (
                            <div className="max-w-md mx-auto">
                                <CopyTextBox text={backupCodes.join("\n")} />
                            </div>
                        )}
                    </div>
                )}

                {/* Action buttons - only show when not in dialog */}
                {!isDialog && (
                    <div className="flex gap-2 justify-end">
                        {showCancelButton && onCancel && (
                            <Button
                                variant="outline"
                                onClick={onCancel}
                                disabled={loading}
                            >
                                {cancelButtonText || "Cancel"}
                            </Button>
                        )}
                        {(step === 1 || step === 2) && (
                            <Button
                                type="button"
                                loading={loading}
                                disabled={loading}
                                onClick={handleSubmit}
                                className="w-full"
                            >
                                {submitButtonText || t("submit")}
                            </Button>
                        )}
                        {step === 3 && (
                            <Button
                                onClick={() =>
                                    handleComplete(
                                        email!,
                                        enableForm.getValues().password
                                    )
                                }
                                className="w-full"
                            >
                                {t("continueToApplication")}
                            </Button>
                        )}
                    </div>
                )}
            </div>
        );
    }
);

export default TwoFactorSetupForm;
