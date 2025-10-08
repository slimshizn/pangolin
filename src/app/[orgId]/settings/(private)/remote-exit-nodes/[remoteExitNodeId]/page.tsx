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

import { redirect } from "next/navigation";

export default async function RemoteExitNodePage(props: {
    params: Promise<{ orgId: string; remoteExitNodeId: string }>;
}) {
    const params = await props.params;
    redirect(
        `/${params.orgId}/settings/remote-exit-nodes/${params.remoteExitNodeId}/general`
    );
}
