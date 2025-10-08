import { build } from "@server/build";

// Import both modules
import * as certificateModule from "./certificates";
import * as privateCertificateModule from "./privateCertificates";

// Conditionally export Remote Certificates implementation based on build type
const remoteCertificatesImplementation = build === "oss" ? certificateModule : privateCertificateModule;

// Re-export all items from the selected implementation
export const { 
    getValidCertificatesForDomains,
    getValidCertificatesForDomainsHybrid
 } = remoteCertificatesImplementation;