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

export const NotifyUsageLimitReached = ({ email, limitName, currentUsage, usageLimit, billingLink }: Props) => {
    const previewText = `You've reached your ${limitName} usage limit - Action required`;
    const usagePercentage = Math.round((currentUsage / usageLimit) * 100);

    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Tailwind config={themeColors}>
                <Body className="font-sans bg-gray-50">
                    <EmailContainer>
                        <EmailLetterHead />

                        <EmailHeading>Usage Limit Reached - Action Required</EmailHeading>

                        <EmailGreeting>Hi there,</EmailGreeting>

                        <EmailText>
                            You have reached your usage limit for <strong>{limitName}</strong>.
                        </EmailText>

                        <EmailText>
                            <strong>Current Usage:</strong> {currentUsage} of {usageLimit} ({usagePercentage}%)
                        </EmailText>

                        <EmailText>
                            <strong>Important:</strong> Your functionality may now be restricted and your sites may disconnect until you either upgrade your plan or your usage resets. To prevent any service interruption, immediate action is recommended.
                        </EmailText>

                        <EmailText>
                            <strong>What you can do:</strong>
                            <br />• <a href={billingLink} style={{ color: '#2563eb', fontWeight: 'bold' }}>Upgrade your plan immediately</a> to restore full functionality
                            <br />• Monitor your usage to stay within limits in the future
                        </EmailText>

                        <EmailText>
                            If you have any questions or need immediate assistance, please contact our support team right away.
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

export default NotifyUsageLimitReached;
