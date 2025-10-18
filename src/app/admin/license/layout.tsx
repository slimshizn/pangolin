import { build } from "@server/build";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

interface LayoutProps {
    children: React.ReactNode;
}

export default async function AdminLicenseLayout(props: LayoutProps) {
    if (build !== "enterprise") {
        redirect(`/admin`);
    }

    return props.children;
}

