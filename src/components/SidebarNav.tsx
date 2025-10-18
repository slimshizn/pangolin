"use client";

import React from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@app/lib/cn";
import { useUserContext } from "@app/hooks/useUserContext";
import { Badge } from "@app/components/ui/badge";
import { useLicenseStatusContext } from "@app/hooks/useLicenseStatusContext";
import { useTranslations } from "next-intl";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger
} from "@app/components/ui/tooltip";
import { build } from "@server/build";

export type SidebarNavItem = {
    href: string;
    title: string;
    icon?: React.ReactNode;
    showEE?: boolean;
    isBeta?: boolean;
};

export type SidebarNavSection = {
    heading: string;
    items: SidebarNavItem[];
};

export interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
    sections: SidebarNavSection[];
    disabled?: boolean;
    onItemClick?: () => void;
    isCollapsed?: boolean;
}

export function SidebarNav({
    className,
    sections,
    disabled = false,
    onItemClick,
    isCollapsed = false,
    ...props
}: SidebarNavProps) {
    const pathname = usePathname();
    const params = useParams();
    const orgId = params.orgId as string;
    const niceId = params.niceId as string;
    const resourceId = params.resourceId as string;
    const userId = params.userId as string;
    const apiKeyId = params.apiKeyId as string;
    const clientId = params.clientId as string;
    const { licenseStatus, isUnlocked } = useLicenseStatusContext();
    const { user } = useUserContext();
    const t = useTranslations();

    function hydrateHref(val: string): string {
        return val
            .replace("{orgId}", orgId)
            .replace("{niceId}", niceId)
            .replace("{resourceId}", resourceId)
            .replace("{userId}", userId)
            .replace("{apiKeyId}", apiKeyId)
            .replace("{clientId}", clientId);
    }

    const renderNavItem = (
        item: SidebarNavItem,
        hydratedHref: string,
        isActive: boolean,
        isDisabled: boolean
    ) => {
        const tooltipText =
            item.showEE && !isUnlocked()
                ? `${t(item.title)} (${t("licenseBadge")})`
                : t(item.title);

        const itemContent = (
            <Link
                href={isDisabled ? "#" : hydratedHref}
                className={cn(
                    "flex items-center rounded transition-colors hover:bg-secondary/50 dark:hover:bg-secondary/20 rounded-md",
                    isCollapsed ? "px-2 py-2 justify-center" : "px-3 py-1.5",
                    isActive
                        ? "text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground",
                    isDisabled && "cursor-not-allowed opacity-60"
                )}
                onClick={(e) => {
                    if (isDisabled) {
                        e.preventDefault();
                    } else if (onItemClick) {
                        onItemClick();
                    }
                }}
                tabIndex={isDisabled ? -1 : undefined}
                aria-disabled={isDisabled}
            >
                {item.icon && (
                    <span
                        className={cn("flex-shrink-0", !isCollapsed && "mr-2")}
                    >
                        {item.icon}
                    </span>
                )}
                {!isCollapsed && (
                    <>
                        <span>{t(item.title)}</span>
                        {item.isBeta && (
                            <Badge
                                variant="outline"
                                className="ml-2 text-muted-foreground"
                            >
                                {t("beta")}
                            </Badge>
                        )}
                        {build === "enterprise" &&
                            item.showEE &&
                            !isUnlocked() && (
                                <Badge
                                    variant="outlinePrimary"
                                    className="ml-2"
                                >
                                    {t("licenseBadge")}
                                </Badge>
                            )}
                    </>
                )}
            </Link>
        );

        if (isCollapsed) {
            return (
                <TooltipProvider key={hydratedHref}>
                    <Tooltip>
                        <TooltipTrigger asChild>{itemContent}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                            <p>{tooltipText}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }

        return (
            <React.Fragment key={hydratedHref}>{itemContent}</React.Fragment>
        );
    };

    return (
        <nav
            className={cn(
                "flex flex-col gap-2 text-sm",
                disabled && "pointer-events-none opacity-60",
                className
            )}
            {...props}
        >
            {sections.map((section) => (
                <div key={section.heading} className="mb-2">
                    {!isCollapsed && (
                        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {section.heading}
                        </div>
                    )}
                    <div className="flex flex-col gap-1">
                        {section.items.map((item) => {
                            const hydratedHref = hydrateHref(item.href);
                            const isActive = pathname.startsWith(hydratedHref);
                            const isEE =
                                build === "enterprise" &&
                                item.showEE &&
                                !isUnlocked();
                            const isDisabled = disabled || isEE;
                            return renderNavItem(
                                item,
                                hydratedHref,
                                isActive,
                                isDisabled || false
                            );
                        })}
                    </div>
                </div>
            ))}
        </nav>
    );
}
