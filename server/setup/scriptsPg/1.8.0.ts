import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.8.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`
            BEGIN;

            ALTER TABLE "clients" ALTER COLUMN "bytesIn" SET DATA TYPE real;
            ALTER TABLE "clients" ALTER COLUMN "bytesOut" SET DATA TYPE real;
            ALTER TABLE "clientSession" ALTER COLUMN "expiresAt" SET DATA TYPE bigint;
            ALTER TABLE "resources" ADD COLUMN "enableProxy" boolean DEFAULT true;
            ALTER TABLE "sites" ADD COLUMN "remoteSubnets" text;
            ALTER TABLE "user" ADD COLUMN "termsAcceptedTimestamp" varchar;
            ALTER TABLE "user" ADD COLUMN "termsVersion" varchar;

            COMMIT;
        `);

        console.log(`Migrated database schema`);
    } catch (e) {
        console.log("Unable to migrate database schema");
        console.log(e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
