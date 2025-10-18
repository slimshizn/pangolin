import { redirect } from "next/navigation";

export default async function IdpPage(props: {
    params: Promise<{ orgId: string; idpId: string }>;
}) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/idp/${params.idpId}/general`);
}
