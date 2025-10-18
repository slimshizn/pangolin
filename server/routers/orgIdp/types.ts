import { Idp, IdpOidcConfig } from "@server/db";

export type CreateOrgIdpResponse = {
    idpId: number;
    redirectUrl: string;
};

export type GetOrgIdpResponse = {
    idp: Idp,
    idpOidcConfig: IdpOidcConfig | null,
    redirectUrl: string
}

export type ListOrgIdpsResponse = {
    idps: {
        idpId: number;
        orgId: string;
        name: string;
        type: string;
        variant: string;
    }[],
    pagination: {
        total: number;
        limit: number;
        offset: number;
    };
};
