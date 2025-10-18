export async function getOrgTierData(
    orgId: string
): Promise<{ tier: string | null; active: boolean }> {
    let tier = null;
    let active = false;

    return { tier, active };
}
