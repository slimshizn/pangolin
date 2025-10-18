import { SidebarNavItem } from "@app/components/SidebarNav";
import { build } from "@server/build";
import {
    Home,
    Settings,
    Users,
    Link as LinkIcon,
    Waypoints,
    Combine,
    Fingerprint,
    Workflow,
    KeyRound,
    TicketCheck,
    User,
    Globe, // Added from 'dev' branch
    MonitorUp, // Added from 'dev' branch
    Server,
    Zap,
    CreditCard
} from "lucide-react";

export type SidebarNavSection = {
    // Added from 'dev' branch
    heading: string;
    items: SidebarNavItem[];
};

// Merged from 'user-management-and-resources' branch
export const orgLangingNavItems: SidebarNavItem[] = [
    {
        title: "sidebarAccount",
        href: "/{orgId}",
        icon: <User className="h-4 w-4" />
    }
];

export const orgNavSections = (
    enableClients: boolean = true
): SidebarNavSection[] => [
    {
        heading: "General",
        items: [
            {
                title: "sidebarSites",
                href: "/{orgId}/settings/sites",
                icon: <Combine className="h-4 w-4" />
            },
            {
                title: "sidebarResources",
                href: "/{orgId}/settings/resources",
                icon: <Waypoints className="h-4 w-4" />
            },
            ...(enableClients
                ? [
                      {
                          title: "sidebarClients",
                          href: "/{orgId}/settings/clients",
                          icon: <MonitorUp className="h-4 w-4" />,
                          isBeta: true
                      }
                  ]
                : []),
            ...(build == "saas"
                ? [
                      {
                          title: "sidebarRemoteExitNodes",
                          href: "/{orgId}/settings/remote-exit-nodes",
                          icon: <Server className="h-4 w-4" />,
                          showEE: true
                      }
                  ]
                : []),
            {
                title: "sidebarDomains",
                href: "/{orgId}/settings/domains",
                icon: <Globe className="h-4 w-4" />
            }
        ]
    },
    {
        heading: "Access Control",
        items: [
            {
                title: "sidebarUsers",
                href: "/{orgId}/settings/access/users",
                icon: <User className="h-4 w-4" />
            },
            {
                title: "sidebarRoles",
                href: "/{orgId}/settings/access/roles",
                icon: <Users className="h-4 w-4" />
            },
            {
                title: "sidebarInvitations",
                href: "/{orgId}/settings/access/invitations",
                icon: <TicketCheck className="h-4 w-4" />
            },
            ...(build == "saas"
                ? [
                      {
                          title: "sidebarIdentityProviders",
                          href: "/{orgId}/settings/idp",
                          icon: <Fingerprint className="h-4 w-4" />,
                          showEE: true
                      }
                  ]
                : []),
            {
                title: "sidebarShareableLinks",
                href: "/{orgId}/settings/share-links",
                icon: <LinkIcon className="h-4 w-4" />
            }
        ]
    },
    {
        heading: "Organization",
        items: [
            {
                title: "sidebarApiKeys",
                href: "/{orgId}/settings/api-keys",
                icon: <KeyRound className="h-4 w-4" />
            },
            ...(build == "saas"
                ? [
                      {
                          title: "sidebarBilling",
                          href: "/{orgId}/settings/billing",
                          icon: <CreditCard className="h-4 w-4" />
                      }
                  ]
                : []),
            ...(build == "saas"
                ? [
                      {
                          title: "sidebarEnterpriseLicenses",
                          href: "/{orgId}/settings/license",
                          icon: <TicketCheck className="h-4 w-4" />
                      }
                  ]
                : []),
            {
                title: "sidebarSettings",
                href: "/{orgId}/settings/general",
                icon: <Settings className="h-4 w-4" />
            }
        ]
    }
];

export const adminNavSections: SidebarNavSection[] = [
    {
        heading: "Admin",
        items: [
            {
                title: "sidebarAllUsers",
                href: "/admin/users",
                icon: <Users className="h-4 w-4" />
            },
            {
                title: "sidebarApiKeys",
                href: "/admin/api-keys",
                icon: <KeyRound className="h-4 w-4" />
            },
            {
                title: "sidebarIdentityProviders",
                href: "/admin/idp",
                icon: <Fingerprint className="h-4 w-4" />
            },
            ...(build == "enterprise"
                ? [
                      {
                          title: "sidebarLicense",
                          href: "/admin/license",
                          icon: <TicketCheck className="h-4 w-4" />
                      }
                  ]
                : [])
        ]
    }
];
