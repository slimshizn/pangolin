import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { randomUUID } from "crypto";

const version = "1.10.4";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        const webauthnCredentialsQuery = await db.execute(
            sql`SELECT "credentialId", "publicKey", "userId", "signCount", "transports", "name", "lastUsed", "dateCreated" FROM "webauthnCredentials"`
        );

        const webauthnCredentials = webauthnCredentialsQuery.rows as {
            credentialId: string;
            publicKey: string;
            userId: string;
            signCount: number;
            transports: string | null;
            name: string | null;
            lastUsed: string;
            dateCreated: string;
        }[];

        for (const webauthnCredential of webauthnCredentials) {
            const newCredentialId = isoBase64URL.fromBuffer(
                new Uint8Array(
                    Buffer.from(webauthnCredential.credentialId, "base64")
                )
            );
            const newPublicKey = isoBase64URL.fromBuffer(
                new Uint8Array(
                    Buffer.from(webauthnCredential.publicKey, "base64")
                )
            );

            // Delete the old record
            await db.execute(sql`
                DELETE FROM "webauthnCredentials"
                WHERE "credentialId" = ${webauthnCredential.credentialId}
            `);

            // Insert the updated record with converted values
            await db.execute(sql`
                INSERT INTO "webauthnCredentials" ("credentialId", "publicKey", "userId", "signCount", "transports", "name", "lastUsed", "dateCreated")
                VALUES (${newCredentialId}, ${newPublicKey}, ${webauthnCredential.userId}, ${webauthnCredential.signCount}, ${webauthnCredential.transports}, ${webauthnCredential.name}, ${webauthnCredential.lastUsed}, ${webauthnCredential.dateCreated})
            `);
        }

        // 1. Add the column with placeholder so NOT NULL is satisfied
        await db.execute(sql`
            ALTER TABLE "resources"
            ADD COLUMN IF NOT EXISTS "resourceGuid" varchar(36) NOT NULL DEFAULT 'PLACEHOLDER'
        `);

        // 2. Fetch every row to backfill UUIDs
        const rows = await db.execute(
            sql`SELECT "resourceId" FROM "resources" WHERE "resourceGuid" = 'PLACEHOLDER'`
        );
        const resources = rows.rows as { resourceId: number }[];

        for (const r of resources) {
            await db.execute(sql`
                UPDATE "resources"
                SET "resourceGuid" = ${randomUUID()}
                WHERE "resourceId" = ${r.resourceId}
            `);
        }

        // 3. Add UNIQUE constraint now that values are filled
        await db.execute(sql`
            ALTER TABLE "resources"
            ADD CONSTRAINT "resources_resourceGuid_unique" UNIQUE("resourceGuid")
        `);

        await db.execute(sql`ALTER TABLE "orgs" ADD COLUMN IF NOT EXISTS "settings" text`);

        await db.execute(sql`COMMIT`);
        console.log(`Updated credentialId and publicKey`);
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to update credentialId and publicKey");
        console.log(e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
