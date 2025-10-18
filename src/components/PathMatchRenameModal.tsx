import { Settings } from "lucide-react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";

import { Badge } from "@app/components/ui/badge";
import { Label } from "@app/components/ui/label";
import { useEffect, useState } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import {
    Credenza,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle,
    CredenzaTrigger
} from "./Credenza";
import { useTranslations } from "next-intl";

export function PathMatchModal({
    value,
    onChange,
    trigger
}: {
    value: { path: string | null; pathMatchType: string | null };
    onChange: (config: {
        path: string | null;
        pathMatchType: string | null;
    }) => void;
    trigger: React.ReactNode;
}) {
    const t = useTranslations();

    const [open, setOpen] = useState(false);
    const [matchType, setMatchType] = useState(
        value?.pathMatchType || "prefix"
    );
    const [path, setPath] = useState(value?.path || "");

    useEffect(() => {
        if (open) {
            setMatchType(value?.pathMatchType || "prefix");
            setPath(value?.path || "");
        }
    }, [open, value]);

    const handleSave = () => {
        onChange({ pathMatchType: matchType as any, path: path.trim() });
        setOpen(false);
    };

    const handleClear = () => {
        onChange({ pathMatchType: null, path: null });
        setOpen(false);
    };

    const getPlaceholder = () => (matchType === "regex" ? t("pathMatchRegexPlaceholder") : t("pathMatchDefaultPlaceholder"));

    const getHelpText = () => {
        switch (matchType) {
            case "prefix":
                return t("pathMatchPrefixHelp");
            case "exact":
                return t("pathMatchExactHelp");
            case "regex":
                return t("pathMatchRegexHelp");
            default:
                return "";
        }
    };

    return (
        <Credenza open={open} onOpenChange={setOpen}>
            <CredenzaTrigger asChild>{trigger}</CredenzaTrigger>
            <CredenzaContent className="sm:max-w-[500px]">
                <CredenzaHeader>
                    <CredenzaTitle>{t("pathMatchModalTitle")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("pathMatchModalDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="match-type">{t("pathMatchType")}</Label>
                        <Select value={matchType} onValueChange={setMatchType}>
                            <SelectTrigger id="match-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="prefix">{t("pathMatchPrefix")}</SelectItem>
                                <SelectItem value="exact">{t("pathMatchExact")}</SelectItem>
                                <SelectItem value="regex">{t("pathMatchRegex")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="path-value">{t("pathMatchValue")}</Label>
                        <Input
                            id="path-value"
                            placeholder={getPlaceholder()}
                            value={path}
                            onChange={(e) => setPath(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                            {getHelpText()}
                        </p>
                    </div>
                </div>
                <CredenzaFooter className="gap-2">
                    {/* {value?.path && (
                        )} */}
                        <Button variant="outline" onClick={handleClear}>
                            {t("clear")}
                        </Button>
                    <Button onClick={handleSave} disabled={!path.trim()}>
                        {t("saveChanges")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

export function PathRewriteModal({
    value,
    onChange,
    trigger,
    disabled
}: {
    value: { rewritePath: string | null; rewritePathType: string | null };
    onChange: (config: {
        rewritePath: string | null;
        rewritePathType: string | null;
    }) => void;
    trigger: React.ReactNode;
    disabled?: boolean;
}) {
    const t = useTranslations();
    const [open, setOpen] = useState(false);
    const [rewriteType, setRewriteType] = useState(
        value?.rewritePathType || "prefix"
    );
    const [rewritePath, setRewritePath] = useState(value?.rewritePath || "");

    useEffect(() => {
        if (open) {
            setRewriteType(value?.rewritePathType || "prefix");
            setRewritePath(value?.rewritePath || "");
        }
    }, [open, value]);

    const handleSave = () => {
        onChange({
            rewritePathType: rewriteType as any,
            rewritePath: rewritePath.trim()
        });
        setOpen(false);
    };

    const handleClear = () => {
        onChange({ rewritePathType: null, rewritePath: null });
        setOpen(false);
    };

    const getPlaceholder = () => {
        switch (rewriteType) {
            case "regex":
                return t("pathRewriteRegexPlaceholder");
            case "stripPrefix":
                return "";
            default:
                return t("pathRewriteDefaultPlaceholder");
        }
    };

    const getHelpText = () => {
        switch (rewriteType) {
            case "prefix":
                return t("pathRewritePrefixHelp");
            case "exact":
                return t("pathRewriteExactHelp");
            case "regex":
                return t("pathRewriteRegexHelp");
            case "stripPrefix":
                return t("pathRewriteStripPrefixHelp");
            default:
                return "";
        }
    };

    return (
        <Credenza open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
            <CredenzaTrigger asChild>{trigger}</CredenzaTrigger>
            <CredenzaContent className="sm:max-w-[500px]">
                <CredenzaHeader>
                    <CredenzaTitle>{t("pathRewriteModalTitle")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("pathRewriteModalDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="rewrite-type">{t("pathRewriteType")}</Label>
                        <Select
                            value={rewriteType}
                            onValueChange={setRewriteType}
                        >
                            <SelectTrigger id="rewrite-type">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="prefix">
                                    {t("pathRewritePrefixOption")}
                                </SelectItem>
                                <SelectItem value="exact">
                                    {t("pathRewriteExactOption")}
                                </SelectItem>
                                <SelectItem value="regex">
                                    {t("pathRewriteRegexOption")}
                                </SelectItem>
                                <SelectItem value="stripPrefix">
                                    {t("pathRewriteStripPrefixOption")}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="rewrite-value">{t("pathRewriteValue")}</Label>
                        <Input
                            id="rewrite-value"
                            placeholder={getPlaceholder()}
                            value={rewritePath}
                            onChange={(e) => setRewritePath(e.target.value)}
                        />
                        <p className="text-sm text-muted-foreground">
                            {getHelpText()}
                        </p>
                    </div>
                </div>
                <CredenzaFooter className="gap-2">
                    {value?.rewritePath && (
                        <Button variant="outline" onClick={handleClear}>
                            {t("clear")}
                        </Button>
                    )}
                    <Button
                        onClick={handleSave}
                        disabled={
                            rewriteType !== "stripPrefix" && !rewritePath.trim()
                        }
                    >
                        {t("saveChanges")}
                    </Button>
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}

export function PathMatchDisplay({
    value
}: {
    value: { path: string | null; pathMatchType: string | null };
}) {
    const t = useTranslations();
    
    if (!value?.path) return null;

    const getTypeLabel = (type: string | null) => {
        const labels: Record<string, string> = {
            prefix: t("pathMatchPrefix"),
            exact: t("pathMatchExact"),
            regex: t("pathMatchRegex")
        };
        return labels[type || ""] || type;
    };

    return (
        <div className="flex items-center gap-2 w-full text-left">
            <Badge variant="secondary" className="text-xs shrink-0">
                {getTypeLabel(value.pathMatchType)}
            </Badge>
            <code className="text-sm flex-1 truncate" title={value.path}>
                {value.path}
            </code>
            <Settings className="h-4 w-4" />
        </div>
    );
}

export function PathRewriteDisplay({
    value
}: {
    value: { rewritePath: string | null; rewritePathType: string | null };
}) {
    const t = useTranslations();
    
    if (!value?.rewritePath && value?.rewritePathType !== "stripPrefix")
        return null;

    const getTypeLabel = (type: string | null) => {
        const labels: Record<string, string> = {
            prefix: t("pathRewritePrefix"),
            exact: t("pathRewriteExact"),
            regex: t("pathRewriteRegex"),
            stripPrefix: t("pathRewriteStrip")
        };
        return labels[type || ""] || type;
    };

    return (
        <div className="flex items-center gap-2 w-full text-left">
            <Badge variant="secondary" className="text-xs shrink-0">
                {getTypeLabel(value.rewritePathType)}
            </Badge>
            <code
                className="text-sm flex-1 truncate"
                title={value.rewritePath || ""}
            >
                {value.rewritePath || (
                    <span className="text-muted-foreground italic">
                        ({t("pathRewriteStripLabel")})
                    </span>
                )}
            </code>
            <Settings className="h-4 w-4" />
        </div>
    );
}
