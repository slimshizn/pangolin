import NodeCache from "node-cache";
import { sendToClient } from "#dynamic/routers/ws";

export const dockerSocketCache = new NodeCache({
    stdTTL: 3600 // seconds
});

export function fetchContainers(newtId: string) {
    const payload = {
        type: `newt/socket/fetch`,
        data: {}
    };
    sendToClient(newtId, payload);
}

export function dockerSocket(newtId: string) {
    const payload = {
        type: `newt/socket/check`,
        data: {}
    };
    sendToClient(newtId, payload);
}
