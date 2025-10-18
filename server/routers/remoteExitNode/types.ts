import { RemoteExitNode } from "@server/db";

export type CreateRemoteExitNodeResponse = {
    token: string;
    remoteExitNodeId: string;
    secret: string;
};

export type PickRemoteExitNodeDefaultsResponse = {
    remoteExitNodeId: string;
    secret: string;
};

export type QuickStartRemoteExitNodeResponse = {
    remoteExitNodeId: string;
    secret: string;
};

export type ListRemoteExitNodesResponse = {
    remoteExitNodes: {
        remoteExitNodeId: string;
        dateCreated: string;
        version: string | null;
        exitNodeId: number | null;
        name: string;
        address: string;
        endpoint: string;
        online: boolean;
        type: string | null;
    }[];
    pagination: { total: number; limit: number; offset: number };
};

export type GetRemoteExitNodeResponse = { remoteExitNodeId: string; dateCreated: string; version: string | null; exitNodeId: number | null; name: string; address: string; endpoint: string; online: boolean; type: string | null; }