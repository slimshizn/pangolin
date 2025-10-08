import { build } from "@server/build";

// Import both modules
import * as traefikModule from "./getTraefikConfig";
import * as privateTraefikModule from "./privateGetTraefikConfig";

// Conditionally export Traefik configuration implementation based on build type
const traefikImplementation = build === "oss" ? traefikModule : privateTraefikModule;

// Re-export all items from the selected implementation
export const { getTraefikConfig } = traefikImplementation;