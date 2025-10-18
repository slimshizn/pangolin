import { redirect } from "next/navigation";

export default async function RemoteExitNodePage(props: {
    params: Promise<{ orgId: string; remoteExitNodeId: string }>;
}) {
    const params = await props.params;
    redirect(
        `/${params.orgId}/settings/remote-exit-nodes/${params.remoteExitNodeId}/general`
    );
}
