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

import { S3Client } from "@aws-sdk/client-s3";
import config from "@server/lib/config";

export const s3Client = new S3Client({
    region: config.getRawPrivateConfig().stripe?.s3Region || "us-east-1",
});
