"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionTitle as SectionTitle,
    SettingsSectionBody,
    SettingsSectionFooter
} from "@app/components/Settings";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { Alert } from "@app/components/ui/alert";
import { Button } from "@app/components/ui/button";
import {
    Shield,
    Zap,
    RefreshCw,
    Activity,
    Wrench,
    CheckCircle,
    ExternalLink
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function ManagedPage() {
    const t = useTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("managedSelfHosted.title")}
                description={t("managedSelfHosted.description")}
            />

            <SettingsContainer>
                <SettingsSection>
                    <SettingsSectionBody>
                        <p className="mb-4">
                            <strong>{t("managedSelfHosted.introTitle")}</strong>{" "}
                            {t("managedSelfHosted.introDescription")}
                        </p>
                        <p className="mb-6">
                            {t("managedSelfHosted.introDetail")}
                        </p>

                        <div className="grid gap-4 md:grid-cols-2 py-4">
                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-medium">
                                            {t(
                                                "managedSelfHosted.benefitSimplerOperations.title"
                                            )}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "managedSelfHosted.benefitSimplerOperations.description"
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <RefreshCw className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-medium">
                                            {t(
                                                "managedSelfHosted.benefitAutomaticUpdates.title"
                                            )}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "managedSelfHosted.benefitAutomaticUpdates.description"
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <Wrench className="w-5 h-5 text-orange-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-medium">
                                            {t(
                                                "managedSelfHosted.benefitLessMaintenance.title"
                                            )}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "managedSelfHosted.benefitLessMaintenance.description"
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <Activity className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-medium">
                                            {t(
                                                "managedSelfHosted.benefitCloudFailover.title"
                                            )}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "managedSelfHosted.benefitCloudFailover.description"
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Shield className="w-5 h-5 text-indigo-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-medium">
                                            {t(
                                                "managedSelfHosted.benefitHighAvailability.title"
                                            )}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "managedSelfHosted.benefitHighAvailability.description"
                                            )}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-3">
                                    <Zap className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                                    <div>
                                        <h4 className="font-medium">
                                            {t(
                                                "managedSelfHosted.benefitFutureEnhancements.title"
                                            )}
                                        </h4>
                                        <p className="text-sm text-muted-foreground">
                                            {t(
                                                "managedSelfHosted.benefitFutureEnhancements.description"
                                            )}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Alert
                            variant="neutral"
                            className="flex items-center gap-1"
                        >
                            {t("managedSelfHosted.docsAlert.text")}{" "}
                            <Link
                                href="https://docs.digpangolin.com/manage/managed"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:underline text-primary flex items-center gap-1"
                            >
                                {t("managedSelfHosted.docsAlert.documentation")}
                                <ExternalLink className="w-4 h-4" />
                            </Link>
                            .
                        </Alert>
                    </SettingsSectionBody>
                    <SettingsSectionFooter>
                        <Link
                            href="https://docs.digpangolin.com/self-host/convert-managed"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline text-primary flex items-center gap-1"
                        >
                            <Button>
                                {t("managedSelfHosted.convertButton")}
                            </Button>
                        </Link>
                    </SettingsSectionFooter>
                </SettingsSection>
            </SettingsContainer>
        </>
    );
}
