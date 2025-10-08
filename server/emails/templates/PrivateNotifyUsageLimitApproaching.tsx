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

import React from "react";
import { Body, Head, Html, Preview, Tailwind } from "@react-email/components";
import { themeColors } from "./lib/theme";
import {
    EmailContainer,
    EmailFooter,
    EmailGreeting,
    EmailHeading,
    EmailLetterHead,
    EmailSignature,
    EmailText
} from "./components/Email";

interface Props {
    email: string;
    limitName: string;
    currentUsage: number;
    usageLimit: number;
    billingLink: string; // Link to billing page
}

export const NotifyUsageLimitApproaching = ({ email, limitName, currentUsage, usageLimit, billingLink }: Props) => {
    const previewText = `Your usage for ${limitName} is approaching the limit.`;
    const usagePercentage = Math.round((currentUsage / usageLimit) * 100);

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Tailwind config={themeColors}>
                <Body className="font-sans bg-gray-50">
                    <EmailContainer>
                        <EmailLetterHead />

                        <EmailHeading>Usage Limit Warning</EmailHeading>

                        <EmailGreeting>Hi there,</EmailGreeting>

                        <EmailText>
                            We wanted to let you know that your usage for <strong>{limitName}</strong> is approaching your plan limit.
                        </EmailText>

                        <EmailText>
                            <strong>Current Usage:</strong> {currentUsage} of {usageLimit} ({usagePercentage}%)
                        </EmailText>

                        <EmailText>
                            Once you reach your limit, some functionality may be restricted or your sites may disconnect until you upgrade your plan or your usage resets.
                        </EmailText>

                        <EmailText>
                            To avoid any interruption to your service, we recommend upgrading your plan or monitoring your usage closely. You can <a href={billingLink}>upgrade your plan here</a>.
                        </EmailText>

                        <EmailText>
                            If you have any questions or need assistance, please don't hesitate to reach out to our support team.
                        </EmailText>

                        <EmailFooter>
                            <EmailSignature />
                        </EmailFooter>
                    </EmailContainer>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default NotifyUsageLimitApproaching;
