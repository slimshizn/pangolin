import { db, loginPage, loginPageOrg } from "@server/db";
import config from "@server/lib/config";
import { eq } from "drizzle-orm";

export async function generateOidcRedirectUrl(
    idpId: number,
    orgId?: string,
    loginPageId?: number
): Promise<string> {
    let baseUrl: string | undefined;

    const secure = config.getRawConfig().app.dashboard_url?.startsWith("https");
    const method = secure ? "https" : "http";

    if (loginPageId) {
        const [res] = await db
            .select()
            .from(loginPage)
            .where(eq(loginPage.loginPageId, loginPageId))
            .limit(1);

        if (res && res.fullDomain) {
            baseUrl = `${method}://${res.fullDomain}`;
        }
    } else if (orgId) {
        const [res] = await db
            .select()
            .from(loginPageOrg)
            .where(eq(loginPageOrg.orgId, orgId))
            .innerJoin(
                loginPage,
                eq(loginPage.loginPageId, loginPageOrg.loginPageId)
            )
            .limit(1);

        if (res?.loginPage && res.loginPage.domainId && res.loginPage.fullDomain) {
            baseUrl = `${method}://${res.loginPage.fullDomain}`;
        }
    }

    if (!baseUrl) {
        baseUrl = config.getRawConfig().app.dashboard_url!;
    }

    const redirectPath = `/auth/idp/${idpId}/oidc/callback`;
    const redirectUrl = new URL(redirectPath, baseUrl!).toString();
    return redirectUrl;
}
