export enum TierId {
    STANDARD = "standard",
}

export type TierPriceSet = {
    [key in TierId]: string;
};

export const tierPriceSet: TierPriceSet = { // Free tier matches the freeLimitSet
    [TierId.STANDARD]: "price_1RrQ9cD3Ee2Ir7Wmqdy3KBa0",
};

export const tierPriceSetSandbox: TierPriceSet = { // Free tier matches the freeLimitSet
    // when matching tier the keys closer to 0 index are matched first so list the tiers in descending order of value
    [TierId.STANDARD]: "price_1RrAYJDCpkOb237By2s1P32m",
};

export function getTierPriceSet(environment?: string, sandbox_mode?: boolean): TierPriceSet {
    if ((process.env.ENVIRONMENT == "prod" && process.env.SANDBOX_MODE !== "true") || (environment === "prod" && sandbox_mode !== true)) { // THIS GETS LOADED CLIENT SIDE AND SERVER SIDE
        return tierPriceSet;
    } else {
        return tierPriceSetSandbox;
    }
}
