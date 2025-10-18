import { render } from "@react-email/render";
import { ReactElement } from "react";
import emailClient from "@server/emails";
import logger from "@server/logger";

export async function sendEmail(
    template: ReactElement,
    opts: {
        name?: string;
        from: string | undefined;
        to: string | undefined;
        subject: string;
    }
) {
    if (!emailClient) {
        logger.warn("Email client not configured, skipping email send");
        return;
    }

    if (!opts.from || !opts.to || !opts.subject) {
        logger.error("Email missing required fields", opts);
        return;
    }

    const emailHtml = await render(template);

    const appName = process.env.BRANDING_APP_NAME || "Pangolin"; // From the private config loading into env vars to seperate away the private config

    await emailClient.sendMail({
        from: {
            name: opts.name || appName,
            address: opts.from
        },
        to: opts.to,
        subject: opts.subject,
        html: emailHtml
    });
}

export default sendEmail;
