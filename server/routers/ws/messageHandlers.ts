import {
    handleNewtRegisterMessage,
    handleReceiveBandwidthMessage,
    handleGetConfigMessage,
    handleDockerStatusMessage,
    handleDockerContainersMessage,
    handleNewtPingRequestMessage,
    handleApplyBlueprintMessage
} from "../newt";
import {
    handleOlmRegisterMessage,
    handleOlmRelayMessage,
    handleOlmPingMessage,
    startOlmOfflineChecker
} from "../olm";
import { handleRemoteExitNodeRegisterMessage, handleRemoteExitNodePingMessage, startRemoteExitNodeOfflineChecker } from "@server/routers/private/remoteExitNode";
import { MessageHandler } from "./privateWs";
import { handleHealthcheckStatusMessage } from "../target";
import { build } from "@server/build";

export const messageHandlers: Record<string, MessageHandler> = {
    "newt/wg/register": handleNewtRegisterMessage,
    "olm/wg/register": handleOlmRegisterMessage,
    "newt/wg/get-config": handleGetConfigMessage,
    "newt/receive-bandwidth": handleReceiveBandwidthMessage,
    "olm/wg/relay": handleOlmRelayMessage,
    "olm/ping": handleOlmPingMessage,
    "newt/socket/status": handleDockerStatusMessage,
    "newt/socket/containers": handleDockerContainersMessage,
    "newt/ping/request": handleNewtPingRequestMessage,
    "newt/blueprint/apply": handleApplyBlueprintMessage,
    "newt/healthcheck/status": handleHealthcheckStatusMessage,
    
    "remoteExitNode/register": handleRemoteExitNodeRegisterMessage,
    "remoteExitNode/ping": handleRemoteExitNodePingMessage,
};

startOlmOfflineChecker(); // this is to handle the offline check for olms
if (build != "oss") {
    startRemoteExitNodeOfflineChecker(); // this is to handle the offline check for remote exit nodes
}