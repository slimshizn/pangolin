import Stripe from "stripe";

export enum FeatureId {
    SITE_UPTIME = "siteUptime",
    USERS = "users",
    EGRESS_DATA_MB = "egressDataMb",
    DOMAINS = "domains",
    REMOTE_EXIT_NODES = "remoteExitNodes"
}

export const FeatureMeterIds: Record<FeatureId, string> = {
    [FeatureId.SITE_UPTIME]: "mtr_61Srrej5wUJuiTWgo41D3Ee2Ir7WmDLU",
    [FeatureId.USERS]: "mtr_61SrreISyIWpwUNGR41D3Ee2Ir7WmQro",
    [FeatureId.EGRESS_DATA_MB]: "mtr_61Srreh9eWrExDSCe41D3Ee2Ir7Wm5YW",
    [FeatureId.DOMAINS]: "mtr_61Ss9nIKDNMw0LDRU41D3Ee2Ir7WmRPU",
    [FeatureId.REMOTE_EXIT_NODES]: "mtr_61T86UXnfxTVXy9sD41D3Ee2Ir7WmFTE"
};

export const FeatureMeterIdsSandbox: Record<FeatureId, string> = {
    [FeatureId.SITE_UPTIME]: "mtr_test_61Snh3cees4w60gv841DCpkOb237BDEu",
    [FeatureId.USERS]: "mtr_test_61Sn5fLtq1gSfRkyA41DCpkOb237B6au",
    [FeatureId.EGRESS_DATA_MB]: "mtr_test_61Snh2a2m6qome5Kv41DCpkOb237B3dQ",
    [FeatureId.DOMAINS]: "mtr_test_61SsA8qrdAlgPpFRQ41DCpkOb237BGts",
    [FeatureId.REMOTE_EXIT_NODES]: "mtr_test_61T86Vqmwa3D9ra3341DCpkOb237B94K"
};

export function getFeatureMeterId(featureId: FeatureId): string {
    if (process.env.ENVIRONMENT == "prod" && process.env.SANDBOX_MODE !== "true") {
        return FeatureMeterIds[featureId];
    } else {
        return FeatureMeterIdsSandbox[featureId];
    }
}

export function getFeatureIdByMetricId(metricId: string): FeatureId | undefined {
    return (Object.entries(FeatureMeterIds) as [FeatureId, string][])
        .find(([_, v]) => v === metricId)?.[0];
}

export type FeaturePriceSet = {
    [key in Exclude<FeatureId, FeatureId.DOMAINS>]: string;
} & {
    [FeatureId.DOMAINS]?: string; // Optional since domains are not billed
};

export const standardFeaturePriceSet: FeaturePriceSet = { // Free tier matches the freeLimitSet
    [FeatureId.SITE_UPTIME]: "price_1RrQc4D3Ee2Ir7WmaJGZ3MtF",
    [FeatureId.USERS]: "price_1RrQeJD3Ee2Ir7WmgveP3xea",
    [FeatureId.EGRESS_DATA_MB]: "price_1RrQXFD3Ee2Ir7WmvGDlgxQk",
    // [FeatureId.DOMAINS]: "price_1Rz3tMD3Ee2Ir7Wm5qLeASzC",
    [FeatureId.REMOTE_EXIT_NODES]: "price_1S46weD3Ee2Ir7Wm94KEHI4h"
};

export const standardFeaturePriceSetSandbox: FeaturePriceSet = { // Free tier matches the freeLimitSet
    [FeatureId.SITE_UPTIME]: "price_1RefFBDCpkOb237BPrKZ8IEU",
    [FeatureId.USERS]: "price_1ReNa4DCpkOb237Bc67G5muF",
    [FeatureId.EGRESS_DATA_MB]: "price_1Rfp9LDCpkOb237BwuN5Oiu0",
    // [FeatureId.DOMAINS]: "price_1Ryi88DCpkOb237B2D6DM80b",
    [FeatureId.REMOTE_EXIT_NODES]: "price_1RyiZvDCpkOb237BXpmoIYJL"
};

export function getStandardFeaturePriceSet(): FeaturePriceSet {
    if (process.env.ENVIRONMENT == "prod" && process.env.SANDBOX_MODE !== "true") {
        return standardFeaturePriceSet;
    } else {
        return standardFeaturePriceSetSandbox;
    }
}

export function getLineItems(featurePriceSet: FeaturePriceSet): Stripe.Checkout.SessionCreateParams.LineItem[] {
    return Object.entries(featurePriceSet).map(([featureId, priceId]) => ({
        price: priceId,
    }));
}