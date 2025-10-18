/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import * as crypto from "crypto";

/**
 * Validates a JWT using a public key
 * @param token - The JWT to validate
 * @param publicKey - The public key used for verification (PEM format)
 * @returns The decoded payload if validation succeeds, throws an error otherwise
 */
function validateJWT<Payload>(
    token: string,
    publicKey: string
): Payload {
    // Split the JWT into its three parts
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Decode the header to get the algorithm
    const header = JSON.parse(Buffer.from(encodedHeader, "base64").toString());
    const algorithm = header.alg;

    // Verify the signature
    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const isValid = verify(signatureInput, signature, publicKey, algorithm);

    if (!isValid) {
        throw new Error("Invalid signature");
    }

    // Decode the payload
    const payload = JSON.parse(
        Buffer.from(encodedPayload, "base64").toString()
    );

    // Check if the token has expired
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
        throw new Error("Token has expired");
    }

    return payload;
}

/**
 * Verifies the signature of a JWT
 */
function verify(
    input: string,
    signature: string,
    publicKey: string,
    algorithm: string
): boolean {
    let verifyAlgorithm: string;

    // Map JWT algorithm name to Node.js crypto algorithm name
    switch (algorithm) {
        case "RS256":
            verifyAlgorithm = "RSA-SHA256";
            break;
        case "RS384":
            verifyAlgorithm = "RSA-SHA384";
            break;
        case "RS512":
            verifyAlgorithm = "RSA-SHA512";
            break;
        case "ES256":
            verifyAlgorithm = "SHA256";
            break;
        case "ES384":
            verifyAlgorithm = "SHA384";
            break;
        case "ES512":
            verifyAlgorithm = "SHA512";
            break;
        default:
            throw new Error(`Unsupported algorithm: ${algorithm}`);
    }

    // Convert base64url signature to standard base64
    const base64Signature = base64URLToBase64(signature);

    // Verify the signature
    const verifier = crypto.createVerify(verifyAlgorithm);
    verifier.update(input);
    return verifier.verify(publicKey, base64Signature, "base64");
}

/**
 * Converts base64url format to standard base64
 */
function base64URLToBase64(base64url: string): string {
    // Add padding if needed
    let base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");

    const pad = base64.length % 4;
    if (pad) {
        if (pad === 1) {
            throw new Error("Invalid base64url string");
        }
        base64 += "=".repeat(4 - pad);
    }

    return base64;
}

export { validateJWT };
