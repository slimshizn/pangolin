import maxmind, { CountryResponse, Reader } from "maxmind";
import config from "@server/lib/config";

let maxmindLookup: Reader<CountryResponse> | null;
if (config.getRawConfig().server.maxmind_db_path) {
    maxmindLookup = await maxmind.open<CountryResponse>(
        config.getRawConfig().server.maxmind_db_path!
    );
} else {
    maxmindLookup = null;
}

export { maxmindLookup };
