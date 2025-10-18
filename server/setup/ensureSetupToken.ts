import { db, setupTokens, users } from "@server/db";
import { eq } from "drizzle-orm";
import { generateRandomString, RandomReader } from "@oslojs/crypto/random";
import moment from "moment";
import logger from "@server/logger";

const random: RandomReader = {
    read(bytes: Uint8Array): void {
        crypto.getRandomValues(bytes);
    }
};

function generateToken(): string {
    // Generate a 32-character alphanumeric token
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    return generateRandomString(random, alphabet, 32);
}

function generateId(length: number): string {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    return generateRandomString(random, alphabet, length);
}

export async function ensureSetupToken() {
    try {
        // Check if a server admin already exists
        const [existingAdmin] = await db
            .select()
            .from(users)
            .where(eq(users.serverAdmin, true));

        // If admin exists, no need for setup token
        if (existingAdmin) {
            logger.warn("Server admin exists. Setup token generation skipped.");
            return;
        }

        // Check if a setup token already exists
        const existingTokens = await db
            .select()
            .from(setupTokens)
            .where(eq(setupTokens.used, false));

        // If unused token exists, display it instead of creating a new one
        if (existingTokens.length > 0) {
            console.log("=== SETUP TOKEN EXISTS ===");
            console.log("Token:", existingTokens[0].token);
            console.log("Use this token on the initial setup page");
            console.log("================================");
            return;
        }

        // Generate a new setup token
        const token = generateToken();
        const tokenId = generateId(15);

        await db.insert(setupTokens).values({
            tokenId: tokenId,
            token: token,
            used: false,
            dateCreated: moment().toISOString(),
            dateUsed: null
        });

        console.log("=== SETUP TOKEN GENERATED ===");
        console.log("Token:", token);
        console.log("Use this token on the initial setup page");
        console.log("================================");
    } catch (error) {
        console.error("Failed to ensure setup token:", error);
        throw error;
    }
} 