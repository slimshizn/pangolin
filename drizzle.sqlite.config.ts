import { build } from "@server/build";
import { APP_PATH } from "@server/lib/consts";
import { defineConfig } from "drizzle-kit";
import path from "path";

let schema;
if (build === "oss") {
    schema = [path.join("server", "db", "sqlite", "schema.ts")];
} else {
    schema = [
        path.join("server", "db", "sqlite", "schema.ts"),
        path.join("server", "db", "sqlite", "privateSchema.ts")
    ];
}

export default defineConfig({
    dialect: "sqlite",
    schema: schema,
    out: path.join("server", "migrations"),
    verbose: true,
    dbCredentials: {
        url: path.join(APP_PATH, "db", "db.sqlite")
    }
});
