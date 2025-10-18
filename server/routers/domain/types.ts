export type CheckDomainAvailabilityResponse = {
    available: boolean;
    options: {
        domainNamespaceId: string;
        domainId: string;
        fullDomain: string;
    }[];
};