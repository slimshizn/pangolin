import { defineConfig } from "drizzle-kit";
import path from "path";

const schema = [
    path.join("server", "db", "pg", "schema"),
];

export default defineConfig({
    dialect: "postgresql",
    schema: schema,
    out: path.join("server", "migrations"),
    verbose: true,
    dbCredentials: {
        url: process.env.DATABASE_URL as string
    }
});
