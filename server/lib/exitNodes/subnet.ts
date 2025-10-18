import { db, exitNodes } from "@server/db";
import config from "@server/lib/config";
import { findNextAvailableCidr } from "@server/lib/ip";

export async function getNextAvailableSubnet(): Promise<string> {
    // Get all existing subnets from routes table
    const existingAddresses = await db
        .select({
            address: exitNodes.address
        })
        .from(exitNodes);

    const addresses = existingAddresses.map((a) => a.address);
    let subnet = findNextAvailableCidr(
        addresses,
        config.getRawConfig().gerbil.block_size,
        config.getRawConfig().gerbil.subnet_group
    );
    if (!subnet) {
        throw new Error("No available subnets remaining in space");
    }

    // replace the last octet with 1
    subnet =
        subnet.split(".").slice(0, 3).join(".") +
        ".1" +
        "/" +
        subnet.split("/")[1];
    return subnet;
}