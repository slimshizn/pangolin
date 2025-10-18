import { Limit, Subscription, SubscriptionItem, Usage } from "@server/db";

export type GetOrgSubscriptionResponse = {
    subscription: Subscription | null;
    items: SubscriptionItem[];
};

export type GetOrgUsageResponse = {
    usage: Usage[];
    limits: Limit[];
};

export type GetOrgTierResponse = {
    tier: string | null;
    active: boolean;
};

