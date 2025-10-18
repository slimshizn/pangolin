import {
    Newt,
    newts,
    NewtSession,
    olms,
    Olm,
    OlmSession,
    RemoteExitNode,
    RemoteExitNodeSession,
    remoteExitNodes
} from "@server/db";
import { IncomingMessage } from "http";
import { WebSocket } from "ws";

// Custom interfaces
export interface WebSocketRequest extends IncomingMessage {
    token?: string;
}

export type ClientType = "newt" | "olm" | "remoteExitNode";

export interface AuthenticatedWebSocket extends WebSocket {
    client?: Newt | Olm | RemoteExitNode;
    clientType?: ClientType;
    connectionId?: string;
    isFullyConnected?: boolean;
    pendingMessages?: Buffer[];
}

export interface TokenPayload {
    client: Newt | Olm | RemoteExitNode;
    session: NewtSession | OlmSession | RemoteExitNodeSession;
    clientType: ClientType;
}

export interface WSMessage {
    type: string;
    data: any;
}

export interface HandlerResponse {
    message: WSMessage;
    broadcast?: boolean;
    excludeSender?: boolean;
    targetClientId?: string;
}

export interface HandlerContext {
    message: WSMessage;
    senderWs: WebSocket;
    client: Newt | Olm | RemoteExitNode | undefined;
    clientType: ClientType;
    sendToClient: (clientId: string, message: WSMessage) => Promise<boolean>;
    broadcastToAllExcept: (
        message: WSMessage,
        excludeClientId?: string
    ) => Promise<void>;
    connectedClients: Map<string, WebSocket[]>;
}

export type MessageHandler = (context: HandlerContext) => Promise<HandlerResponse | void>;

// Redis message type for cross-node communication
export interface RedisMessage {
    type: "direct" | "broadcast";
    targetClientId?: string;
    excludeClientId?: string;
    message: WSMessage;
    fromNodeId: string;
}