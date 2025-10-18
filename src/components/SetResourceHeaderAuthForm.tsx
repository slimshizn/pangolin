"use client";

import { Button } from "@app/components/ui/button";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import { toast } from "@app/hooks/useToast";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { formatAxiosError } from "@app/lib/api";
import { AxiosResponse } from "axios";
import { Resource } from "@server/db";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";

const setHeaderAuthFormSchema = z.object({
    user: z.string().min(4).max(100),
    password: z.string().min(4).max(100)
});

type SetHeaderAuthFormValues = z.infer<typeof setHeaderAuthFormSchema>;

const defaultValues: Partial<SetHeaderAuthFormValues> = {
    user: "",
    password: ""
};

type SetHeaderAuthFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    resourceId: number;
    onSetHeaderAuth?: () => void;
};

export default function SetResourceHeaderAuthForm({
    open,
    setOpen,
    resourceId,
    onSetHeaderAuth
}: SetHeaderAuthFormProps) {
    const api = createApiClient(useEnvContext());
    const t = useTranslations();

    const [loading, setLoading] = useState(false);

    const form = useForm<SetHeaderAuthFormValues>({
        resolver: zodResolver(setHeaderAuthFormSchema),
        defaultValues
    });

    useEffect(() => {
        if (!open) {
            return;
        }

        form.reset();
    }, [open]);

    async function onSubmit(data: SetHeaderAuthFormValues) {
        setLoading(true);

        api.post<AxiosResponse<Resource>>(`/resource/${resourceId}/header-auth`, {
            user: data.user,
            password: data.password
        })
            .catch((e) => {
                toast({
                    variant: "destructive",
                    title: t('resourceErrorHeaderAuthSetup'),
                    description: formatAxiosError(
                        e,
                        t('resourceErrorHeaderAuthSetupDescription')
                    )
                });
            })
            .then(() => {
                toast({
                    title: t('resourceHeaderAuthSetup'),
                    description: t('resourceHeaderAuthSetupDescription')
                });

                if (onSetHeaderAuth) {
                    onSetHeaderAuth();
                }
            })
            .finally(() => setLoading(false));
    }

    return (
        <>
            <Credenza
                open={open}
                onOpenChange={(val) => {
                    setOpen(val);
                    setLoading(false);
                    form.reset();
                }}
            >
                <CredenzaContent>
                    <CredenzaHeader>
                        <CredenzaTitle>{t('resourceHeaderAuthSetupTitle')}</CredenzaTitle>
                        <CredenzaDescription>
                            {t('resourceHeaderAuthSetupTitleDescription')}
                        </CredenzaDescription>
                    </CredenzaHeader>
                    <CredenzaBody>
                        <Form {...form}>
                            <form
                                onSubmit={form.handleSubmit(onSubmit)}
                                className="space-y-4"
                                id="set-header-auth-form"
                            >
                                <FormField
                                    control={form.control}
                                    name="user"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('user')}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="text"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('password')}</FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="off"
                                                    type="password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </form>
                        </Form>
                    </CredenzaBody>
                    <CredenzaFooter>
                        <CredenzaClose asChild>
                            <Button variant="outline">{t('close')}</Button>
                        </CredenzaClose>
                        <Button
                            type="submit"
                            form="set-header-auth-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t('resourceHeaderAuthSubmit')}
                        </Button>
                    </CredenzaFooter>
                </CredenzaContent>
            </Credenza>
        </>
    );
}
