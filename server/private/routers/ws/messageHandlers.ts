/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import {
    handleRemoteExitNodeRegisterMessage,
    handleRemoteExitNodePingMessage,
    startRemoteExitNodeOfflineChecker
} from "#private/routers/remoteExitNode";
import { MessageHandler } from "@server/routers/ws";

export const messageHandlers: Record<string, MessageHandler> = {
    "remoteExitNode/register": handleRemoteExitNodeRegisterMessage,
    "remoteExitNode/ping": handleRemoteExitNodePingMessage
};

startRemoteExitNodeOfflineChecker(); // this is to handle the offline check for remote exit nodes