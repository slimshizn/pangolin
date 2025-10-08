"use client";

import {
    SettingsContainer,
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionForm,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { z } from "zod";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@app/components/ui/input";
import { Button } from "@app/components/ui/button";
import { Checkbox } from "@app/components/ui/checkbox";
import { useParams, useRouter } from "next/navigation";
import { ListSitesResponse } from "@server/routers/site";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { toast } from "@app/hooks/useToast";
import { AxiosResponse } from "axios";
import { Resource } from "@server/db";
import { StrategySelect } from "@app/components/StrategySelect";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { ListDomainsResponse } from "@server/routers/domain";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList
} from "@app/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger
} from "@app/components/ui/popover";
import { CaretSortIcon, CheckIcon } from "@radix-ui/react-icons";
import { cn } from "@app/lib/cn";
import { ArrowRight, Info, MoveRight, Plus, SquareArrowOutUpRight } from "lucide-react";
import CopyTextBox from "@app/components/CopyTextBox";
import Link from "next/link";
import { useTranslations } from "next-intl";
import DomainPicker from "@app/components/DomainPicker";
import { build } from "@server/build";
import { ContainersSelector } from "@app/components/ContainersSelector";
import {
    ColumnDef,
    getFilteredRowModel,
    getSortedRowModel,
    getPaginationRowModel,
    getCoreRowModel,
    useReactTable,
    flexRender,
    Row
} from "@tanstack/react-table";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@app/components/ui/table";
import { Switch } from "@app/components/ui/switch";
import { ArrayElement } from "@server/types/ArrayElement";
import { isTargetValid } from "@server/lib/validators";
import { ListTargetsResponse } from "@server/routers/target";
import { DockerManager, DockerState } from "@app/lib/docker";
import { parseHostTarget } from "@app/lib/parseHostTarget";
import { toASCII, toUnicode } from 'punycode';
import { DomainRow } from "../../../../../components/DomainsTable";
import { finalizeSubdomainSanitize } from "@app/lib/subdomain-utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@app/components/ui/tooltip";
import { PathMatchDisplay, PathMatchModal, PathRewriteDisplay, PathRewriteModal } from "@app/components/PathMatchRenameModal";


const baseResourceFormSchema = z.object({
    name: z.string().min(1).max(255),
    http: z.boolean()
});

const httpResourceFormSchema = z.object({
    domainId: z.string().nonempty(),
    subdomain: z.string().optional()
});

const tcpUdpResourceFormSchema = z.object({
    protocol: z.string(),
    proxyPort: z.number().int().min(1).max(65535)
    // enableProxy: z.boolean().default(false)
});

const addTargetSchema = z.object({
    ip: z.string().refine(isTargetValid),
    method: z.string().nullable(),
    port: z.coerce.number().int().positive(),
    siteId: z.number().int().positive(),
    path: z.string().optional().nullable(),
    pathMatchType: z.enum(["exact", "prefix", "regex"]).optional().nullable(),
    rewritePath: z.string().optional().nullable(),
    rewritePathType: z.enum(["exact", "prefix", "regex", "stripPrefix"]).optional().nullable(),
    priority: z.number().int().min(1).max(1000)
}).refine(
    (data) => {
        // If path is provided, pathMatchType must be provided
        if (data.path && !data.pathMatchType) {
            return false;
        }
        // If pathMatchType is provided, path must be provided
        if (data.pathMatchType && !data.path) {
            return false;
        }
        // Validate path based on pathMatchType
        if (data.path && data.pathMatchType) {
            switch (data.pathMatchType) {
                case "exact":
                case "prefix":
                    // Path should start with /
                    return data.path.startsWith("/");
                case "regex":
                    // Validate regex
                    try {
                        new RegExp(data.path);
                        return true;
                    } catch {
                        return false;
                    }
            }
        }
        return true;
    },
    {
        message: "Invalid path configuration"
    }
)
    .refine(
        (data) => {
            // If rewritePath is provided, rewritePathType must be provided
            if (data.rewritePath && !data.rewritePathType) {
                return false;
            }
            // If rewritePathType is provided, rewritePath must be provided
            if (data.rewritePathType && !data.rewritePath) {
                return false;
            }
            return true;
        },
        {
            message: "Invalid rewrite path configuration"
        }
    );

type BaseResourceFormValues = z.infer<typeof baseResourceFormSchema>;
type HttpResourceFormValues = z.infer<typeof httpResourceFormSchema>;
type TcpUdpResourceFormValues = z.infer<typeof tcpUdpResourceFormSchema>;

type ResourceType = "http" | "raw";

interface ResourceTypeOption {
    id: ResourceType;
    title: string;
    description: string;
    disabled?: boolean;
}

type LocalTarget = Omit<
    ArrayElement<ListTargetsResponse["targets"]> & {
        new?: boolean;
        updated?: boolean;
        siteType: string | null;
    },
    "protocol"
>;

export default function Page() {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const { orgId } = useParams();
    const router = useRouter();
    const t = useTranslations();

    const [loadingPage, setLoadingPage] = useState(true);
    const [sites, setSites] = useState<ListSitesResponse["sites"]>([]);
    const [baseDomains, setBaseDomains] = useState<
        { domainId: string; baseDomain: string }[]
    >([]);
    const [createLoading, setCreateLoading] = useState(false);
    const [showSnippets, setShowSnippets] = useState(false);
    const [resourceId, setResourceId] = useState<number | null>(null);

    // Target management state
    const [targets, setTargets] = useState<LocalTarget[]>([]);
    const [targetsToRemove, setTargetsToRemove] = useState<number[]>([]);
    const [dockerStates, setDockerStates] = useState<Map<number, DockerState>>(new Map());

    const resourceTypes: ReadonlyArray<ResourceTypeOption> = [
        {
            id: "http",
            title: t("resourceHTTP"),
            description: t("resourceHTTPDescription")
        },
        ...(!env.flags.allowRawResources
            ? []
            : [
                {
                    id: "raw" as ResourceType,
                    title: t("resourceRaw"),
                    description: t("resourceRawDescription")
                }
            ])
    ];

    const baseForm = useForm({
        resolver: zodResolver(baseResourceFormSchema),
        defaultValues: {
            name: "",
            http: true
        }
    });

    const httpForm = useForm({
        resolver: zodResolver(httpResourceFormSchema),
        defaultValues: {}
    });

    const tcpUdpForm = useForm({
        resolver: zodResolver(tcpUdpResourceFormSchema),
        defaultValues: {
            protocol: "tcp",
            proxyPort: undefined
            // enableProxy: false
        }
    });

    const addTargetForm = useForm({
        resolver: zodResolver(addTargetSchema),
        defaultValues: {
            ip: "",
            method: baseForm.watch("http") ? "http" : null,
            port: "" as any as number,
            path: null,
            pathMatchType: null,
            rewritePath: null,
            rewritePathType: null,
            priority: 100,
        } as z.infer<typeof addTargetSchema>
    });

    const watchedIp = addTargetForm.watch("ip");
    const watchedPort = addTargetForm.watch("port");
    const watchedSiteId = addTargetForm.watch("siteId");

    const handleContainerSelect = (hostname: string, port?: number) => {
        addTargetForm.setValue("ip", hostname);
        if (port) {
            addTargetForm.setValue("port", port);
        }
    };

    const initializeDockerForSite = async (siteId: number) => {
        if (dockerStates.has(siteId)) {
            return; // Already initialized
        }

        const dockerManager = new DockerManager(api, siteId);
        const dockerState = await dockerManager.initializeDocker();

        setDockerStates(prev => new Map(prev.set(siteId, dockerState)));
    };

    const refreshContainersForSite = async (siteId: number) => {
        const dockerManager = new DockerManager(api, siteId);
        const containers = await dockerManager.fetchContainers();

        setDockerStates(prev => {
            const newMap = new Map(prev);
            const existingState = newMap.get(siteId);
            if (existingState) {
                newMap.set(siteId, { ...existingState, containers });
            }
            return newMap;
        });
    };

    const getDockerStateForSite = (siteId: number): DockerState => {
        return dockerStates.get(siteId) || {
            isEnabled: false,
            isAvailable: false,
            containers: []
        };
    };

    async function addTarget(data: z.infer<typeof addTargetSchema>) {
        // Check if target with same IP, port and method already exists
        const isDuplicate = targets.some(
            (target) =>
                target.ip === data.ip &&
                target.port === data.port &&
                target.method === data.method &&
                target.siteId === data.siteId
        );

        if (isDuplicate) {
            toast({
                variant: "destructive",
                title: t("targetErrorDuplicate"),
                description: t("targetErrorDuplicateDescription")
            });
            return;
        }

        const site = sites.find((site) => site.siteId === data.siteId);

        const newTarget: LocalTarget = {
            ...data,
            path: data.path || null,
            pathMatchType: data.pathMatchType || null,
            rewritePath: data.rewritePath || null,
            rewritePathType: data.rewritePathType || null,
            siteType: site?.type || null,
            enabled: true,
            targetId: new Date().getTime(),
            new: true,
            resourceId: 0, // Will be set when resource is created
            priority: 100, // Default priority
            hcEnabled: false,
            hcPath: null,
            hcMethod: null,
            hcInterval: null,
            hcTimeout: null,
            hcHeaders: null,
            hcScheme: null,
            hcHostname: null,
            hcPort: null,
            hcFollowRedirects: null,
            hcHealth: "unknown",
            hcStatus: null,
            hcMode: null,
            hcUnhealthyInterval: null
        };

        setTargets([...targets, newTarget]);
        addTargetForm.reset({
            ip: "",
            method: baseForm.watch("http") ? "http" : null,
            port: "" as any as number,
            path: null,
            pathMatchType: null,
            rewritePath: null,
            rewritePathType: null,
            priority: 100,
        });
    }

    const removeTarget = (targetId: number) => {
        setTargets([
            ...targets.filter((target) => target.targetId !== targetId)
        ]);

        if (!targets.find((target) => target.targetId === targetId)?.new) {
            setTargetsToRemove([...targetsToRemove, targetId]);
        }
    };

    async function updateTarget(targetId: number, data: Partial<LocalTarget>) {
        const site = sites.find((site) => site.siteId === data.siteId);
        setTargets(
            targets.map((target) =>
                target.targetId === targetId
                    ? {
                        ...target,
                        ...data,
                        updated: true,
                        siteType: site?.type || null
                    }
                    : target
            )
        );
    }

    async function onSubmit() {
        setCreateLoading(true);

        const baseData = baseForm.getValues();
        const isHttp = baseData.http;

        try {
            const payload = {
                name: baseData.name,
                http: baseData.http
            };

            let sanitizedSubdomain: string | undefined;

            if (isHttp) {
                const httpData = httpForm.getValues();

                sanitizedSubdomain = httpData.subdomain
                    ? finalizeSubdomainSanitize(httpData.subdomain)
                    : undefined;

                Object.assign(payload, {
                    subdomain: sanitizedSubdomain ? toASCII(sanitizedSubdomain) : undefined,
                    domainId: httpData.domainId,
                    protocol: "tcp"
                });
            } else {
                const tcpUdpData = tcpUdpForm.getValues();
                Object.assign(payload, {
                    protocol: tcpUdpData.protocol,
                    proxyPort: tcpUdpData.proxyPort
                    // enableProxy: tcpUdpData.enableProxy
                });
            }

            const res = await api
                .put<
                    AxiosResponse<Resource>
                >(`/org/${orgId}/resource/`, payload)
                .catch((e) => {
                    toast({
                        variant: "destructive",
                        title: t("resourceErrorCreate"),
                        description: formatAxiosError(
                            e,
                            t("resourceErrorCreateDescription")
                        )
                    });
                });

            if (res && res.status === 201) {
                const id = res.data.data.resourceId;
                const niceId = res.data.data.niceId;
                setResourceId(id);

                // Create targets if any exist
                if (targets.length > 0) {
                    try {
                        for (const target of targets) {
                            const data = {
                                ip: target.ip,
                                port: target.port,
                                method: target.method,
                                enabled: target.enabled,
                                siteId: target.siteId,
                                hcEnabled: target.hcEnabled,
                                hcPath: target.hcPath || null,
                                hcMethod: target.hcMethod || null,
                                hcInterval: target.hcInterval || null,
                                hcTimeout: target.hcTimeout || null,
                                hcHeaders: target.hcHeaders || null,
                                hcScheme: target.hcScheme || null,
                                hcHostname: target.hcHostname || null,
                                hcPort: target.hcPort || null,
                                hcFollowRedirects:
                                    target.hcFollowRedirects || null,
                                hcStatus: target.hcStatus || null,
                                path: target.path,
                                pathMatchType: target.pathMatchType,
                                rewritePath: target.rewritePath,
                                rewritePathType: target.rewritePathType,
                                priority: target.priority
                            };

                            await api.put(`/resource/${id}/target`, data);
                        }
                    } catch (targetError) {
                        console.error("Error creating targets:", targetError);
                        toast({
                            variant: "destructive",
                            title: t("targetErrorCreate"),
                            description: formatAxiosError(
                                targetError,
                                t("targetErrorCreateDescription")
                            )
                        });
                    }
                }

                if (isHttp) {
                    router.push(`/${orgId}/settings/resources/${niceId}`);
                } else {
                    const tcpUdpData = tcpUdpForm.getValues();
                    // Only show config snippets if enableProxy is explicitly true
                    // if (tcpUdpData.enableProxy === true) {
                    setShowSnippets(true);
                    router.refresh();
                    // } else {
                    //     // If enableProxy is false or undefined, go directly to resource page
                    //     router.push(`/${orgId}/settings/resources/${id}`);
                    // }
                }
            }
        } catch (e) {
            console.error(t("resourceErrorCreateMessage"), e);
            toast({
                variant: "destructive",
                title: t("resourceErrorCreate"),
                description: t("resourceErrorCreateMessageDescription")
            });
        }

        setCreateLoading(false);
    }

    useEffect(() => {
        const load = async () => {
            setLoadingPage(true);

            const fetchSites = async () => {
                const res = await api
                    .get<
                        AxiosResponse<ListSitesResponse>
                    >(`/org/${orgId}/sites/`)
                    .catch((e) => {
                        toast({
                            variant: "destructive",
                            title: t("sitesErrorFetch"),
                            description: formatAxiosError(
                                e,
                                t("sitesErrorFetchDescription")
                            )
                        });
                    });

                if (res?.status === 200) {
                    setSites(res.data.data.sites);

                    // Initialize Docker for newt sites
                    for (const site of res.data.data.sites) {
                        if (site.type === "newt") {
                            initializeDockerForSite(site.siteId);
                        }
                    }

                    // If there's only one site, set it as the default in the form
                    if (res.data.data.sites.length) {
                        addTargetForm.setValue(
                            "siteId",
                            res.data.data.sites[0].siteId
                        );
                    }
                }
            };

            const fetchDomains = async () => {
                const res = await api
                    .get<
                        AxiosResponse<ListDomainsResponse>
                    >(`/org/${orgId}/domains/`)
                    .catch((e) => {
                        toast({
                            variant: "destructive",
                            title: t("domainsErrorFetch"),
                            description: formatAxiosError(
                                e,
                                t("domainsErrorFetchDescription")
                            )
                        });
                    });

                if (res?.status === 200) {
                    const rawDomains = res.data.data.domains as DomainRow[];
                    const domains = rawDomains.map((domain) => ({
                        ...domain,
                        baseDomain: toUnicode(domain.baseDomain),
                    }));
                    setBaseDomains(domains);
                    // if (domains.length) {
                    //     httpForm.setValue("domainId", domains[0].domainId);
                    // }
                }
            };

            await fetchSites();
            await fetchDomains();

            setLoadingPage(false);
        };

        load();
    }, []);

    const columns: ColumnDef<LocalTarget>[] = [
        {
            id: "priority",
            header: () => (
                <div className="flex items-center gap-2">
                    Priority
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                <Info className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                                <p>Higher priority routes are evaluated first. Priority = 100 means automatic ordering (system decides). Use another number to enforce manual priority.</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            ),
            cell: ({ row }) => {
                return (
                    <div className="flex items-center gap-2">
                        <Input
                            type="number"
                            min="1"
                            max="1000"
                            defaultValue={row.original.priority || 100}
                            className="w-20"
                            onBlur={(e) => {
                                const value = parseInt(e.target.value, 10);
                                if (value >= 1 && value <= 1000) {
                                    updateTarget(row.original.targetId, {
                                        ...row.original,
                                        priority: value
                                    });
                                }
                            }}
                        />
                    </div>
                );
            }
        },
        {
            accessorKey: "path",
            header: t("matchPath"),
            cell: ({ row }) => {
                const hasPathMatch = !!(row.original.path || row.original.pathMatchType);

                return hasPathMatch ? (
                    <div className="flex items-center gap-1">
                        <PathMatchModal
                            value={{
                                path: row.original.path,
                                pathMatchType: row.original.pathMatchType,
                            }}
                            onChange={(config) => updateTarget(row.original.targetId, config)}
                            trigger={
                                <Button
                                    variant="outline"
                                    className="flex items-center gap-2 p-2 max-w-md w-full text-left cursor-pointer"
                                >
                                    <PathMatchDisplay
                                        value={{
                                            path: row.original.path,
                                            pathMatchType: row.original.pathMatchType,
                                        }}
                                    />
                                </Button>
                            }
                        />
                        <Button
                            variant="text"
                            size="sm"
                            className="px-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                updateTarget(row.original.targetId, {
                                    ...row.original,
                                    path: null,
                                    pathMatchType: null,
                                    rewritePath: null,
                                    rewritePathType: null
                                });
                            }}
                        >
                            ×
                        </Button>

                        {/* <MoveRight className="ml-1 h-4 w-4" /> */}
                    </div>
                ) : (
                    <PathMatchModal
                        value={{
                            path: row.original.path,
                            pathMatchType: row.original.pathMatchType,
                        }}
                        onChange={(config) => updateTarget(row.original.targetId, config)}
                        trigger={
                            <Button variant="outline">
                                <Plus className="h-4 w-4 mr-2" />
                                {t("matchPath")}
                            </Button>
                        }
                    />
                );
            },
        },
        {
            accessorKey: "siteId",
            header: t("site"),
            cell: ({ row }) => {
                const selectedSite = sites.find(
                    (site) => site.siteId === row.original.siteId
                );

                const handleContainerSelectForTarget = (
                    hostname: string,
                    port?: number
                ) => {
                    updateTarget(row.original.targetId, {
                        ...row.original,
                        ip: hostname
                    });
                    if (port) {
                        updateTarget(row.original.targetId, {
                            ...row.original,
                            port: port
                        });
                    }
                };

                return (
                    <div className="flex gap-2 items-center">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className={cn(
                                        "justify-between flex-1",
                                        !row.original.siteId &&
                                        "text-muted-foreground"
                                    )}
                                >
                                    {row.original.siteId
                                        ? selectedSite?.name
                                        : t("siteSelect")}
                                    <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="p-0">
                                <Command>
                                    <CommandInput
                                        placeholder={t("siteSearch")}
                                    />
                                    <CommandList>
                                        <CommandEmpty>
                                            {t("siteNotFound")}
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {sites.map((site) => (
                                                <CommandItem
                                                    value={`${site.siteId}:${site.name}:${site.niceId}`}
                                                    key={site.siteId}
                                                    onSelect={() => {
                                                        updateTarget(
                                                            row.original
                                                                .targetId,
                                                            {
                                                                siteId: site.siteId
                                                            }
                                                        );
                                                    }}
                                                >
                                                    <CheckIcon
                                                        className={cn(
                                                            "mr-2 h-4 w-4",
                                                            site.siteId ===
                                                                row.original
                                                                    .siteId
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        )}
                                                    />
                                                    {site.name}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                        {selectedSite && selectedSite.type === "newt" && (() => {
                            const dockerState = getDockerStateForSite(selectedSite.siteId);
                            return (
                                <ContainersSelector
                                    site={selectedSite}
                                    containers={dockerState.containers}
                                    isAvailable={dockerState.isAvailable}
                                    onContainerSelect={handleContainerSelectForTarget}
                                    onRefresh={() => refreshContainersForSite(selectedSite.siteId)}
                                />
                            );
                        })()}
                    </div>
                );
            }
        },
        ...(baseForm.watch("http")
            ? [
                {
                    accessorKey: "method",
                    header: t("method"),
                    cell: ({ row }: { row: Row<LocalTarget> }) => (
                        <Select
                            defaultValue={row.original.method ?? ""}
                            onValueChange={(value) =>
                                updateTarget(row.original.targetId, {
                                    ...row.original,
                                    method: value
                                })
                            }
                        >
                            <SelectTrigger>
                                {row.original.method}
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="http">http</SelectItem>
                                <SelectItem value="https">https</SelectItem>
                                <SelectItem value="h2c">h2c</SelectItem>
                            </SelectContent>
                        </Select>
                    )
                }
            ]
            : []),
        {
            accessorKey: "ip",
            header: t("targetAddr"),
            cell: ({ row }) => (
                <Input
                    defaultValue={row.original.ip}
                    className="min-w-[150px]"
                    onBlur={(e) => {
                        const input = e.target.value.trim();
                        const hasProtocol = /^(https?|h2c):\/\//.test(input);
                        const hasPort = /:\d+(?:\/|$)/.test(input);

                        if (hasProtocol || hasPort) {
                            const parsed = parseHostTarget(input);
                            if (parsed) {
                                updateTarget(row.original.targetId, {
                                    ...row.original,
                                    method: hasProtocol ? parsed.protocol : row.original.method,
                                    ip: parsed.host,
                                    port: hasPort ? parsed.port : row.original.port
                                });
                            } else {
                                updateTarget(row.original.targetId, {
                                    ...row.original,
                                    ip: input
                                });
                            }
                        } else {
                            updateTarget(row.original.targetId, {
                                ...row.original,
                                ip: input
                            });
                        }
                    }}
                />
            )
        },
        {
            accessorKey: "port",
            header: t("targetPort"),
            cell: ({ row }) => (
                <Input
                    type="number"
                    defaultValue={row.original.port}
                    className="min-w-[100px]"
                    onBlur={(e) =>
                        updateTarget(row.original.targetId, {
                            ...row.original,
                            port: parseInt(e.target.value, 10)
                        })
                    }
                />
            )
        },
        {
            accessorKey: "rewritePath",
            header: t("rewritePath"),
            cell: ({ row }) => {
                const hasRewritePath = !!(row.original.rewritePath || row.original.rewritePathType);
                const noPathMatch = !row.original.path && !row.original.pathMatchType;

                return hasRewritePath && !noPathMatch ? (
                    <div className="flex items-center gap-1">
                        {/* <MoveRight className="mr-2 h-4 w-4" /> */}
                        <PathRewriteModal
                            value={{
                                rewritePath: row.original.rewritePath,
                                rewritePathType: row.original.rewritePathType,
                            }}
                            onChange={(config) => updateTarget(row.original.targetId, config)}
                            trigger={
                                <Button
                                    variant="outline"
                                    className="flex items-center gap-2 p-2 max-w-md w-full text-left cursor-pointer"
                                    disabled={noPathMatch}
                                >
                                    <PathRewriteDisplay
                                        value={{
                                            rewritePath: row.original.rewritePath,
                                            rewritePathType: row.original.rewritePathType,
                                        }}
                                    />
                                </Button>
                            }
                        />
                        <Button
                            size="sm"
                            variant="text"
                            className="px-1"
                            onClick={(e) => {
                                e.stopPropagation();
                                updateTarget(row.original.targetId, {
                                    ...row.original,
                                    rewritePath: null,
                                    rewritePathType: null,
                                });
                            }}
                        >
                            ×
                        </Button>
                    </div>
                ) : (
                    <PathRewriteModal
                        value={{
                            rewritePath: row.original.rewritePath,
                            rewritePathType: row.original.rewritePathType,
                        }}
                        onChange={(config) => updateTarget(row.original.targetId, config)}
                        trigger={
                            <Button variant="outline" disabled={noPathMatch}>
                                <Plus className="h-4 w-4 mr-2" />
                                {t("rewritePath")}
                            </Button>
                        }
                        disabled={noPathMatch}
                    />
                );
            },
        },
        {
            accessorKey: "enabled",
            header: t("enabled"),
            cell: ({ row }) => (
                <Switch
                    defaultChecked={row.original.enabled}
                    onCheckedChange={(val) =>
                        updateTarget(row.original.targetId, {
                            ...row.original,
                            enabled: val
                        })
                    }
                />
            )
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <>
                    <div className="flex items-center justify-end space-x-2">
                        <Button
                            variant="outline"
                            onClick={() => removeTarget(row.original.targetId)}
                        >
                            {t("delete")}
                        </Button>
                    </div>
                </>
            )
        }
    ];

    const table = useReactTable({
        data: targets,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        state: {
            pagination: {
                pageIndex: 0,
                pageSize: 1000
            }
        }
    });

    return (
        <>
            <div className="flex justify-between">
                <HeaderTitle
                    title={t("resourceCreate")}
                    description={t("resourceCreateDescription")}
                />
                <Button
                    variant="outline"
                    onClick={() => {
                        router.push(`/${orgId}/settings/resources`);
                    }}
                >
                    {t("resourceSeeAll")}
                </Button>
            </div>

            {!loadingPage && (
                <div>
                    {!showSnippets ? (
                        <SettingsContainer>
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("resourceInfo")}
                                    </SettingsSectionTitle>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <SettingsSectionForm>
                                        <Form {...baseForm}>
                                            <form
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter") {
                                                        e.preventDefault(); // block default enter refresh
                                                    }
                                                }}
                                                className="space-y-4"
                                                id="base-resource-form"
                                            >
                                                <FormField
                                                    control={baseForm.control}
                                                    name="name"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormLabel>
                                                                {t("name")}
                                                            </FormLabel>
                                                            <FormControl>
                                                                <Input
                                                                    {...field}
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                            <FormDescription>
                                                                {t(
                                                                    "resourceNameDescription"
                                                                )}
                                                            </FormDescription>
                                                        </FormItem>
                                                    )}
                                                />
                                            </form>
                                        </Form>
                                    </SettingsSectionForm>
                                </SettingsSectionBody>
                            </SettingsSection>

                            {resourceTypes.length > 1 && (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("resourceType")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t("resourceTypeDescription")}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <StrategySelect
                                            options={resourceTypes}
                                            defaultValue="http"
                                            onChange={(value) => {
                                                baseForm.setValue(
                                                    "http",
                                                    value === "http"
                                                );
                                                // Update method default when switching resource type
                                                addTargetForm.setValue(
                                                    "method",
                                                    value === "http"
                                                        ? "http"
                                                        : null
                                                );
                                            }}
                                            cols={2}
                                        />
                                    </SettingsSectionBody>
                                </SettingsSection>
                            )}

                            {baseForm.watch("http") ? (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("resourceHTTPSSettings")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t(
                                                "resourceHTTPSSettingsDescription"
                                            )}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <DomainPicker
                                            orgId={orgId as string}
                                            onDomainChange={(res) => {
                                                httpForm.setValue(
                                                    "subdomain",
                                                    res.subdomain
                                                );
                                                httpForm.setValue(
                                                    "domainId",
                                                    res.domainId
                                                );
                                                console.log(
                                                    "Domain changed:",
                                                    res
                                                );
                                            }}
                                        />
                                    </SettingsSectionBody>
                                </SettingsSection>
                            ) : (
                                <SettingsSection>
                                    <SettingsSectionHeader>
                                        <SettingsSectionTitle>
                                            {t("resourceRawSettings")}
                                        </SettingsSectionTitle>
                                        <SettingsSectionDescription>
                                            {t(
                                                "resourceRawSettingsDescription"
                                            )}
                                        </SettingsSectionDescription>
                                    </SettingsSectionHeader>
                                    <SettingsSectionBody>
                                        <SettingsSectionForm>
                                            <Form {...tcpUdpForm}>
                                                <form
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") {
                                                            e.preventDefault(); // block default enter refresh
                                                        }
                                                    }}
                                                    className="space-y-4"
                                                    id="tcp-udp-settings-form"
                                                >
                                                    <Controller
                                                        control={
                                                            tcpUdpForm.control
                                                        }
                                                        name="protocol"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "protocol"
                                                                    )}
                                                                </FormLabel>
                                                                <Select
                                                                    onValueChange={
                                                                        field.onChange
                                                                    }
                                                                    {...field}
                                                                >
                                                                    <FormControl>
                                                                        <SelectTrigger>
                                                                            <SelectValue
                                                                                placeholder={t(
                                                                                    "protocolSelect"
                                                                                )}
                                                                            />
                                                                        </SelectTrigger>
                                                                    </FormControl>
                                                                    <SelectContent>
                                                                        <SelectItem value="tcp">
                                                                            TCP
                                                                        </SelectItem>
                                                                        <SelectItem value="udp">
                                                                            UDP
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    <FormField
                                                        control={
                                                            tcpUdpForm.control
                                                        }
                                                        name="proxyPort"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "resourcePortNumber"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        type="number"
                                                                        value={
                                                                            field.value ??
                                                                            ""
                                                                        }
                                                                        onChange={(
                                                                            e
                                                                        ) =>
                                                                            field.onChange(
                                                                                e
                                                                                    .target
                                                                                    .value
                                                                                    ? parseInt(
                                                                                        e
                                                                                            .target
                                                                                            .value
                                                                                    )
                                                                                    : undefined
                                                                            )
                                                                        }
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                                <FormDescription>
                                                                    {t(
                                                                        "resourcePortNumberDescription"
                                                                    )}
                                                                </FormDescription>
                                                            </FormItem>
                                                        )}
                                                    />

                                                    {/* {build == "oss" && (
                                                        <FormField
                                                            control={
                                                                tcpUdpForm.control
                                                            }
                                                            name="enableProxy"
                                                            render={({
                                                                field
                                                            }) => (
                                                                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                                                    <FormControl>
                                                                        <Checkbox
                                                                            variant={
                                                                                "outlinePrimarySquare"
                                                                            }
                                                                            checked={
                                                                                field.value
                                                                            }
                                                                            onCheckedChange={
                                                                                field.onChange
                                                                            }
                                                                        />
                                                                    </FormControl>
                                                                    <div className="space-y-1 leading-none">
                                                                        <FormLabel>
                                                                            {t(
                                                                                "resourceEnableProxy"
                                                                            )}
                                                                        </FormLabel>
                                                                        <FormDescription>
                                                                            {t(
                                                                                "resourceEnableProxyDescription"
                                                                            )}
                                                                        </FormDescription>
                                                                    </div>
                                                                </FormItem>
                                                            )}
                                                        />
                                                    )} */}
                                                </form>
                                            </Form>
                                        </SettingsSectionForm>
                                    </SettingsSectionBody>
                                </SettingsSection>
                            )}

                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("targets")}
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        {t("targetsDescription")}
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <div className="p-4 border rounded-md">
                                        <Form {...addTargetForm}>
                                            <form
                                                onSubmit={addTargetForm.handleSubmit(
                                                    addTarget
                                                )}
                                                className="space-y-4"
                                            >
                                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-start">
                                                    <FormField
                                                        control={
                                                            addTargetForm.control
                                                        }
                                                        name="siteId"
                                                        render={({ field }) => (
                                                            <FormItem className="flex flex-col">
                                                                <FormLabel>
                                                                    {t("site")}
                                                                </FormLabel>
                                                                <div className="flex gap-2">
                                                                    <Popover>
                                                                        <PopoverTrigger
                                                                            asChild
                                                                        >
                                                                            <FormControl>
                                                                                <Button
                                                                                    variant="outline"
                                                                                    role="combobox"
                                                                                    className={cn(
                                                                                        "justify-between flex-1",
                                                                                        !field.value &&
                                                                                        "text-muted-foreground"
                                                                                    )}
                                                                                >
                                                                                    {field.value
                                                                                        ? sites.find(
                                                                                            (
                                                                                                site
                                                                                            ) =>
                                                                                                site.siteId ===
                                                                                                field.value
                                                                                        )
                                                                                            ?.name
                                                                                        : t(
                                                                                            "siteSelect"
                                                                                        )}
                                                                                    <CaretSortIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                                                                </Button>
                                                                            </FormControl>
                                                                        </PopoverTrigger>
                                                                        <PopoverContent className="p-0">
                                                                            <Command>
                                                                                <CommandInput
                                                                                    placeholder={t(
                                                                                        "siteSearch"
                                                                                    )}
                                                                                />
                                                                                <CommandList>
                                                                                    <CommandEmpty>
                                                                                        {t(
                                                                                            "siteNotFound"
                                                                                        )}
                                                                                    </CommandEmpty>
                                                                                    <CommandGroup>
                                                                                        {sites.map(
                                                                                            (
                                                                                                site
                                                                                            ) => (
                                                                                                <CommandItem
                                                                                                    value={`${site.siteId}:${site.name}:${site.niceId}`}
                                                                                                    key={
                                                                                                        site.siteId
                                                                                                    }
                                                                                                    onSelect={() => {
                                                                                                        addTargetForm.setValue(
                                                                                                            "siteId",
                                                                                                            site.siteId
                                                                                                        );
                                                                                                    }}
                                                                                                >
                                                                                                    <CheckIcon
                                                                                                        className={cn(
                                                                                                            "mr-2 h-4 w-4",
                                                                                                            site.siteId ===
                                                                                                                field.value
                                                                                                                ? "opacity-100"
                                                                                                                : "opacity-0"
                                                                                                        )}
                                                                                                    />
                                                                                                    {
                                                                                                        site.name
                                                                                                    }
                                                                                                </CommandItem>
                                                                                            )
                                                                                        )}
                                                                                    </CommandGroup>
                                                                                </CommandList>
                                                                            </Command>
                                                                        </PopoverContent>
                                                                    </Popover>

                                                                    {field.value &&
                                                                        (() => {
                                                                            const selectedSite =
                                                                                sites.find(
                                                                                    (
                                                                                        site
                                                                                    ) =>
                                                                                        site.siteId ===
                                                                                        field.value
                                                                                );
                                                                            return selectedSite &&
                                                                                selectedSite.type ===
                                                                                "newt" ? (() => {
                                                                                    const dockerState = getDockerStateForSite(selectedSite.siteId);
                                                                                    return (
                                                                                        <ContainersSelector
                                                                                            site={selectedSite}
                                                                                            containers={dockerState.containers}
                                                                                            isAvailable={dockerState.isAvailable}
                                                                                            onContainerSelect={handleContainerSelect}
                                                                                            onRefresh={() => refreshContainersForSite(selectedSite.siteId)}
                                                                                        />
                                                                                    );
                                                                                })() : null;
                                                                        })()}
                                                                </div>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />

                                                    {baseForm.watch("http") && (
                                                        <FormField
                                                            control={
                                                                addTargetForm.control
                                                            }
                                                            name="method"
                                                            render={({
                                                                field
                                                            }) => (
                                                                <FormItem>
                                                                    <FormLabel>
                                                                        {t(
                                                                            "method"
                                                                        )}
                                                                    </FormLabel>
                                                                    <FormControl>
                                                                        <Select
                                                                            value={
                                                                                field.value ||
                                                                                undefined
                                                                            }
                                                                            onValueChange={(
                                                                                value
                                                                            ) => {
                                                                                addTargetForm.setValue(
                                                                                    "method",
                                                                                    value
                                                                                );
                                                                            }}
                                                                        >
                                                                            <SelectTrigger
                                                                                id="method"
                                                                                className="w-full"
                                                                            >
                                                                                <SelectValue
                                                                                    placeholder={t(
                                                                                        "methodSelect"
                                                                                    )}
                                                                                />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="http">
                                                                                    http
                                                                                </SelectItem>
                                                                                <SelectItem value="https">
                                                                                    https
                                                                                </SelectItem>
                                                                                <SelectItem value="h2c">
                                                                                    h2c
                                                                                </SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </FormControl>
                                                                    <FormMessage />
                                                                </FormItem>
                                                            )}
                                                        />
                                                    )}

                                                    <FormField
                                                        control={addTargetForm.control}
                                                        name="ip"
                                                        render={({ field }) => (
                                                            <FormItem className="relative">
                                                                <FormLabel>{t("targetAddr")}</FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        id="ip"
                                                                        {...field}
                                                                        onBlur={(e) => {
                                                                            const input = e.target.value.trim();
                                                                            const hasProtocol = /^(https?|h2c):\/\//.test(input);
                                                                            const hasPort = /:\d+(?:\/|$)/.test(input);

                                                                            if (hasProtocol || hasPort) {
                                                                                const parsed = parseHostTarget(input);
                                                                                if (parsed) {
                                                                                    if (hasProtocol || !addTargetForm.getValues("method")) {
                                                                                        addTargetForm.setValue("method", parsed.protocol);
                                                                                    }
                                                                                    addTargetForm.setValue("ip", parsed.host);
                                                                                    if (hasPort || !addTargetForm.getValues("port")) {
                                                                                        addTargetForm.setValue("port", parsed.port);
                                                                                    }
                                                                                }
                                                                            } else {
                                                                                field.onBlur();
                                                                            }
                                                                        }}
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <FormField
                                                        control={
                                                            addTargetForm.control
                                                        }
                                                        name="port"
                                                        render={({ field }) => (
                                                            <FormItem>
                                                                <FormLabel>
                                                                    {t(
                                                                        "targetPort"
                                                                    )}
                                                                </FormLabel>
                                                                <FormControl>
                                                                    <Input
                                                                        id="port"
                                                                        type="number"
                                                                        {...field}
                                                                        required
                                                                    />
                                                                </FormControl>
                                                                <FormMessage />
                                                            </FormItem>
                                                        )}
                                                    />
                                                    <Button
                                                        type="submit"
                                                        variant="secondary"
                                                        className="mt-6"
                                                        disabled={
                                                            !(
                                                                watchedIp &&
                                                                watchedPort
                                                            )
                                                        }
                                                    >
                                                        {t("targetSubmit")}
                                                    </Button>
                                                </div>
                                            </form>
                                        </Form>
                                    </div>

                                    {targets.length > 0 ? (
                                        <>
                                            <h6 className="font-semibold">
                                                {t("targetsList")}
                                            </h6>
                                            <div className="">
                                                <Table>
                                                    <TableHeader>
                                                        {table
                                                            .getHeaderGroups()
                                                            .map(
                                                                (
                                                                    headerGroup
                                                                ) => (
                                                                    <TableRow
                                                                        key={
                                                                            headerGroup.id
                                                                        }
                                                                    >
                                                                        {headerGroup.headers.map(
                                                                            (
                                                                                header
                                                                            ) => (
                                                                                <TableHead
                                                                                    key={
                                                                                        header.id
                                                                                    }
                                                                                >
                                                                                    {header.isPlaceholder
                                                                                        ? null
                                                                                        : flexRender(
                                                                                            header
                                                                                                .column
                                                                                                .columnDef
                                                                                                .header,
                                                                                            header.getContext()
                                                                                        )}
                                                                                </TableHead>
                                                                            )
                                                                        )}
                                                                    </TableRow>
                                                                )
                                                            )}
                                                    </TableHeader>
                                                    <TableBody>
                                                        {table.getRowModel()
                                                            .rows?.length ? (
                                                            table
                                                                .getRowModel()
                                                                .rows.map(
                                                                    (row) => (
                                                                        <TableRow
                                                                            key={
                                                                                row.id
                                                                            }
                                                                        >
                                                                            {row
                                                                                .getVisibleCells()
                                                                                .map(
                                                                                    (
                                                                                        cell
                                                                                    ) => (
                                                                                        <TableCell
                                                                                            key={
                                                                                                cell.id
                                                                                            }
                                                                                        >
                                                                                            {flexRender(
                                                                                                cell
                                                                                                    .column
                                                                                                    .columnDef
                                                                                                    .cell,
                                                                                                cell.getContext()
                                                                                            )}
                                                                                        </TableCell>
                                                                                    )
                                                                                )}
                                                                        </TableRow>
                                                                    )
                                                                )
                                                        ) : (
                                                            <TableRow>
                                                                <TableCell
                                                                    colSpan={
                                                                        columns.length
                                                                    }
                                                                    className="h-24 text-center"
                                                                >
                                                                    {t(
                                                                        "targetNoOne"
                                                                    )}
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center py-8">
                                            <p className="text-muted-foreground">
                                                {t("targetNoOne")}
                                            </p>
                                        </div>
                                    )}
                                </SettingsSectionBody>
                            </SettingsSection>

                            <div className="flex justify-end space-x-2 mt-8">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        router.push(
                                            `/${orgId}/settings/resources`
                                        )
                                    }
                                >
                                    {t("cancel")}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={async () => {
                                        const isHttp = baseForm.watch("http");
                                        const baseValid =
                                            await baseForm.trigger();
                                        const settingsValid = isHttp
                                            ? await httpForm.trigger()
                                            : await tcpUdpForm.trigger();

                                        console.log(httpForm.getValues());

                                        if (baseValid && settingsValid) {
                                            onSubmit();
                                        }
                                    }}
                                    loading={createLoading}
                                >
                                    {t("resourceCreate")}
                                </Button>
                            </div>
                        </SettingsContainer>
                    ) : (
                        <SettingsContainer>
                            <SettingsSection>
                                <SettingsSectionHeader>
                                    <SettingsSectionTitle>
                                        {t("resourceConfig")}
                                    </SettingsSectionTitle>
                                    <SettingsSectionDescription>
                                        {t("resourceConfigDescription")}
                                    </SettingsSectionDescription>
                                </SettingsSectionHeader>
                                <SettingsSectionBody>
                                    <div className="space-y-6">
                                        <div className="space-y-4">
                                            <h3 className="text-lg font-semibold">
                                                {t("resourceAddEntrypoints")}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {t("resourceAddEntrypointsEditFile")}
                                            </p>
                                            <CopyTextBox
                                                text={`entryPoints:
  ${tcpUdpForm.getValues("protocol")}-${tcpUdpForm.getValues("proxyPort")}:
    address: ":${tcpUdpForm.getValues("proxyPort")}/${tcpUdpForm.getValues("protocol")}"`}
                                                wrapText={false}
                                            />
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="text-lg font-semibold">
                                                {t("resourceExposePorts")}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                {t("resourceExposePortsEditFile")}
                                            </p>
                                            <CopyTextBox
                                                text={`ports:
  - ${tcpUdpForm.getValues("proxyPort")}:${tcpUdpForm.getValues("proxyPort")}${tcpUdpForm.getValues("protocol") === "tcp" ? "" : "/" + tcpUdpForm.getValues("protocol")}`}
                                                wrapText={false}
                                            />
                                        </div>

                                        <Link
                                            className="text-sm text-primary flex items-center gap-1"
                                            href="https://docs.digpangolin.com/manage/resources/tcp-udp-resources"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                        >
                                            <span>{t("resourceLearnRaw")}</span>
                                            <SquareArrowOutUpRight size={14} />
                                        </Link>
                                    </div>
                                </SettingsSectionBody>
                            </SettingsSection>

                            <div className="flex justify-end space-x-2 mt-8">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        router.push(
                                            `/${orgId}/settings/resources`
                                        )
                                    }
                                >
                                    {t("resourceBack")}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() =>
                                        router.push(
                                            `/${orgId}/settings/resources/${resourceId}/proxy`
                                        )
                                    }
                                >
                                    {t("resourceGoTo")}
                                </Button>
                            </div>
                        </SettingsContainer>
                    )}
                </div>
            )}
        </>
    );
}
