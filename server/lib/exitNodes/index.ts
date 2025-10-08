import { build } from "@server/build";

// Import both modules
import * as exitNodesModule from "./exitNodes";
import * as privateExitNodesModule from "./privateExitNodes";

// Conditionally export exit nodes implementation based on build type
const exitNodesImplementation = build === "oss" ? exitNodesModule : privateExitNodesModule;

// Re-export all items from the selected implementation
export const {
    verifyExitNodeOrgAccess,
    listExitNodes,
    selectBestExitNode,
    checkExitNodeOrg,
    resolveExitNodes
} = exitNodesImplementation;

// Import communications modules
import * as exitNodeCommsModule from "./exitNodeComms";
import * as privateExitNodeCommsModule from "./privateExitNodeComms";

// Conditionally export communications implementation based on build type
const exitNodeCommsImplementation = build === "oss" ? exitNodeCommsModule : privateExitNodeCommsModule;

// Re-export communications functions from the selected implementation
export const {
    sendToExitNode
} = exitNodeCommsImplementation;

// Re-export shared modules
export * from "./subnet";
export * from "./getCurrentExitNodeId";