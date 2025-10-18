import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import InviteStatusCard from "../../components/InviteStatusCard";
import { getTranslations } from "next-intl/server";

export default async function InvitePage(props: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await props.searchParams;

    const tokenParam = params.token as string;
    const emailParam = params.email as string;

    if (!tokenParam) {
        redirect("/");
    }

    const user = await verifySession();
    const t = await getTranslations();

    const parts = tokenParam.split("-");
    if (parts.length !== 2) {
        return (
            <>
                <h1>{t("inviteInvalid")}</h1>
                <p>{t("inviteInvalidDescription")}</p>
            </>
        );
    }

    const inviteId = parts[0];
    const token = parts[1];

    return (
        <>
            <InviteStatusCard
                tokenParam={tokenParam}
                inviteToken={token}
                inviteId={inviteId}
                user={user}
                email={emailParam}
            />
        </>
    );
}
