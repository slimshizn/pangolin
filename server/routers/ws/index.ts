import { build } from "@server/build";

// Import both modules
import * as wsModule from "./ws";
import * as privateWsModule from "./privateWs";

// Conditionally export WebSocket implementation based on build type
const wsImplementation = build === "oss" ? wsModule : privateWsModule;

// Re-export all items from the selected implementation
export const {
    router,
    handleWSUpgrade,
    sendToClient,
    broadcastToAllExcept,
    connectedClients,
    hasActiveConnections,
    getActiveNodes,
    NODE_ID,
    cleanup
} = wsImplementation;

// Re-export the MessageHandler type (both modules have the same type signature)
export type { MessageHandler } from "./privateWs";