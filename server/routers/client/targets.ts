import { sendToClient } from "#dynamic/routers/ws";

export async function addTargets(
    newtId: string,
    destinationIp: string,
    destinationPort: number,
    protocol: string,
    port: number
) {
    const target = `${port}:${destinationIp}:${destinationPort}`;

    await sendToClient(newtId, {
        type: `newt/wg/${protocol}/add`,
        data: {
            targets: [target] // We can only use one target for WireGuard right now
        }
    });
}

export async function removeTargets(
    newtId: string,
    destinationIp: string,
    destinationPort: number,
    protocol: string,
    port: number
) {
    const target = `${port}:${destinationIp}:${destinationPort}`;

    await sendToClient(newtId, {
        type: `newt/wg/${protocol}/remove`,
        data: {
            targets: [target] // We can only use one target for WireGuard right now
        }
    });
}
