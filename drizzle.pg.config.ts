import { defineConfig } from "drizzle-kit";
import path from "path";
import { build } from "@server/build";

let schema;
if (build === "oss") {
    schema = [path.join("server", "db", "pg", "schema.ts")];
} else {
    schema = [
        path.join("server", "db", "pg", "schema.ts"),
        path.join("server", "db", "pg", "privateSchema.ts")
    ];
}

export default defineConfig({
    dialect: "postgresql",
    schema: schema,
    out: path.join("server", "migrations"),
    verbose: true,
    dbCredentials: {
        url: process.env.DATABASE_URL as string
    }
});
