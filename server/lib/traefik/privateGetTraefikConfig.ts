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

import {
    certificates,
    db,
    domainNamespaces,
    exitNodes,
    loginPage,
    targetHealthCheck
} from "@server/db";
import { and, eq, inArray, or, isNull, ne, isNotNull, desc } from "drizzle-orm";
import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import config from "@server/lib/config";
import { orgs, resources, sites, Target, targets } from "@server/db";
import { build } from "@server/build";
import { sanitize } from "./utils";

const redirectHttpsMiddlewareName = "redirect-to-https";
const redirectToRootMiddlewareName = "redirect-to-root";
const badgerMiddlewareName = "badger";

export async function getTraefikConfig(
    exitNodeId: number,
    siteTypes: string[],
    filterOutNamespaceDomains = false,
    generateLoginPageRouters = false
): Promise<any> {
    // Define extended target type with site information
    type TargetWithSite = Target & {
        site: {
            siteId: number;
            type: string;
            subnet: string | null;
            exitNodeId: number | null;
            online: boolean;
        };
    };

    // Get resources with their targets and sites in a single optimized query
    // Start from sites on this exit node, then join to targets and resources
    const resourcesWithTargetsAndSites = await db
        .select({
            // Resource fields
            resourceId: resources.resourceId,
            resourceName: resources.name,
            fullDomain: resources.fullDomain,
            ssl: resources.ssl,
            http: resources.http,
            proxyPort: resources.proxyPort,
            protocol: resources.protocol,
            subdomain: resources.subdomain,
            domainId: resources.domainId,
            enabled: resources.enabled,
            stickySession: resources.stickySession,
            tlsServerName: resources.tlsServerName,
            setHostHeader: resources.setHostHeader,
            enableProxy: resources.enableProxy,
            headers: resources.headers,
            // Target fields
            targetId: targets.targetId,
            targetEnabled: targets.enabled,
            ip: targets.ip,
            method: targets.method,
            port: targets.port,
            internalPort: targets.internalPort,
            hcHealth: targetHealthCheck.hcHealth,
            path: targets.path,
            pathMatchType: targets.pathMatchType,
            priority: targets.priority,
            
            // Site fields
            siteId: sites.siteId,
            siteType: sites.type,
            siteOnline: sites.online,
            subnet: sites.subnet,
            exitNodeId: sites.exitNodeId,
            // Namespace
            domainNamespaceId: domainNamespaces.domainNamespaceId,
            // Certificate
            certificateStatus: certificates.status
        })
        .from(sites)
        .innerJoin(targets, eq(targets.siteId, sites.siteId))
        .innerJoin(resources, eq(resources.resourceId, targets.resourceId))
        .leftJoin(certificates, eq(certificates.domainId, resources.domainId))
        .leftJoin(
            targetHealthCheck,
            eq(targetHealthCheck.targetId, targets.targetId)
        )
        .leftJoin(
            domainNamespaces,
            eq(domainNamespaces.domainId, resources.domainId)
        ) // THIS IS CLOUD ONLY TO FILTER OUT THE DOMAIN NAMESPACES IF REQUIRED
        .where(
            and(
                eq(targets.enabled, true),
                eq(resources.enabled, true),
                // or(
                eq(sites.exitNodeId, exitNodeId),
                //     isNull(sites.exitNodeId)
                // ),
                or(
                    ne(targetHealthCheck.hcHealth, "unhealthy"), // Exclude unhealthy targets
                    isNull(targetHealthCheck.hcHealth) // Include targets with no health check record
                ),
                inArray(sites.type, siteTypes),
                config.getRawConfig().traefik.allow_raw_resources
                    ? isNotNull(resources.http) // ignore the http check if allow_raw_resources is true
                    : eq(resources.http, true)
            )
        )
        .orderBy(desc(targets.priority), targets.targetId); // stable ordering

    // Group by resource and include targets with their unique site data
    const resourcesMap = new Map();

    resourcesWithTargetsAndSites.forEach((row) => {
        const resourceId = row.resourceId;
        const resourceName = sanitize(row.resourceName) || "";
        const targetPath = sanitize(row.path) || ""; // Handle null/undefined paths
        const pathMatchType = row.pathMatchType || "";
        const priority = row.priority ?? 100;

        if (filterOutNamespaceDomains && row.domainNamespaceId) {
            return;
        }

        // Create a unique key combining resourceId and path+pathMatchType
        const pathKey = [targetPath, pathMatchType].filter(Boolean).join("-");
        const mapKey = [resourceId, pathKey].filter(Boolean).join("-");
        const key = sanitize(mapKey);

        if (!resourcesMap.has(key)) {
            resourcesMap.set(key, {
                resourceId: row.resourceId,
                name: resourceName,
                fullDomain: row.fullDomain,
                ssl: row.ssl,
                http: row.http,
                proxyPort: row.proxyPort,
                protocol: row.protocol,
                subdomain: row.subdomain,
                domainId: row.domainId,
                enabled: row.enabled,
                stickySession: row.stickySession,
                tlsServerName: row.tlsServerName,
                setHostHeader: row.setHostHeader,
                enableProxy: row.enableProxy,
                certificateStatus: row.certificateStatus,
                targets: [],
                headers: row.headers,
                path: row.path, // the targets will all have the same path
                pathMatchType: row.pathMatchType, // the targets will all have the same pathMatchType
                priority: priority // may be null, we fallback later
            });
        }

        // Add target with its associated site data
        resourcesMap.get(key).targets.push({
            resourceId: row.resourceId,
            targetId: row.targetId,
            ip: row.ip,
            method: row.method,
            port: row.port,
            internalPort: row.internalPort,
            enabled: row.targetEnabled,
            priority: row.priority,
            site: {
                siteId: row.siteId,
                type: row.siteType,
                subnet: row.subnet,
                exitNodeId: row.exitNodeId,
                online: row.siteOnline
            }
        });
    });

    // make sure we have at least one resource
    if (resourcesMap.size === 0) {
        return {};
    }

    const config_output: any = {
        http: {
            middlewares: {
                [redirectHttpsMiddlewareName]: {
                    redirectScheme: {
                        scheme: "https"
                    }
                },
                [redirectToRootMiddlewareName]: {
                    redirectRegex: {
                        regex: "^(https?)://([^/]+)(/.*)?",
                        replacement: "${1}://${2}/auth/org",
                        permanent: false
                    }
                }
            }
        }
    };

    // get the key and the resource
    for (const [key, resource] of resourcesMap.entries()) {
        const targets = resource.targets;

        const routerName = `${key}-${resource.name}-router`;
        const serviceName = `${key}-${resource.name}-service`;
        const fullDomain = `${resource.fullDomain}`;
        const transportName = `${key}-transport`;
        const headersMiddlewareName = `${key}-headers-middleware`;

        if (!resource.enabled) {
            continue;
        }

        if (resource.http) {
            if (!resource.domainId) {
                continue;
            }

            if (!resource.fullDomain) {
                continue;
            }

            if (resource.certificateStatus !== "valid") {
                logger.debug(
                    `Resource ${resource.resourceId} has certificate stats ${resource.certificateStats}`
                );
                continue;
            }

            // add routers and services empty objects if they don't exist
            if (!config_output.http.routers) {
                config_output.http.routers = {};
            }

            if (!config_output.http.services) {
                config_output.http.services = {};
            }

            const domainParts = fullDomain.split(".");
            let wildCard;
            if (domainParts.length <= 2) {
                wildCard = `*.${domainParts.join(".")}`;
            } else {
                wildCard = `*.${domainParts.slice(1).join(".")}`;
            }

            if (!resource.subdomain) {
                wildCard = resource.fullDomain;
            }

            const configDomain = config.getDomain(resource.domainId);

            let certResolver: string, preferWildcardCert: boolean;
            if (!configDomain) {
                certResolver = config.getRawConfig().traefik.cert_resolver;
                preferWildcardCert =
                    config.getRawConfig().traefik.prefer_wildcard_cert;
            } else {
                certResolver = configDomain.cert_resolver;
                preferWildcardCert = configDomain.prefer_wildcard_cert;
            }

            let tls = {};
            if (build == "oss") {
                tls = {
                    certResolver: certResolver,
                    ...(preferWildcardCert
                        ? {
                              domains: [
                                  {
                                      main: wildCard
                                  }
                              ]
                          }
                        : {})
                };
            }

            const additionalMiddlewares =
                config.getRawConfig().traefik.additional_middlewares || [];

            const routerMiddlewares = [
                badgerMiddlewareName,
                ...additionalMiddlewares
            ];

            if (resource.headers || resource.setHostHeader) {
                // if there are headers, parse them into an object
                const headersObj: { [key: string]: string } = {};
                if (resource.headers) {
                    let headersArr: { name: string; value: string }[] = [];
                    try {
                        headersArr = JSON.parse(resource.headers) as {
                            name: string;
                            value: string;
                        }[];
                    } catch (e) {
                        logger.warn(
                            `Failed to parse headers for resource ${resource.resourceId}: ${e}`
                        );
                    }

                    headersArr.forEach((header) => {
                        headersObj[header.name] = header.value;
                    });
                }

                if (resource.setHostHeader) {
                    headersObj["Host"] = resource.setHostHeader;
                }

                // check if the object is not empty
                if (Object.keys(headersObj).length > 0) {
                    // Add the headers middleware
                    if (!config_output.http.middlewares) {
                        config_output.http.middlewares = {};
                    }
                    config_output.http.middlewares[headersMiddlewareName] = {
                        headers: {
                            customRequestHeaders: headersObj
                        }
                    };

                    routerMiddlewares.push(headersMiddlewareName);
                }
            }

            let rule = `Host(\`${fullDomain}\`)`;

            // priority logic
            let priority: number;
            if (resource.priority && resource.priority != 100) {
                priority = resource.priority;
            } else {
                priority = 100;
                if (resource.path && resource.pathMatchType) {
                    priority += 10;
                    if (resource.pathMatchType === "exact") {
                        priority += 5;
                    } else if (resource.pathMatchType === "prefix") {
                        priority += 3;
                    } else if (resource.pathMatchType === "regex") {
                        priority += 2;
                    }
                    if (resource.path === "/") {
                        priority = 1; // lowest for catch-all
                    }
                }
            }

            if (resource.path && resource.pathMatchType) {
                //priority += 1;
                // add path to rule based on match type
                let path = resource.path;
                // if the path doesn't start with a /, add it
                if (!path.startsWith("/")) {
                    path = `/${path}`;
                }
                if (resource.pathMatchType === "exact") {
                    rule += ` && Path(\`${path}\`)`;
                } else if (resource.pathMatchType === "prefix") {
                    rule += ` && PathPrefix(\`${path}\`)`;
                } else if (resource.pathMatchType === "regex") {
                    rule += ` && PathRegexp(\`${resource.path}\`)`; // this is the raw path because it's a regex
                }
            }

            config_output.http.routers![routerName] = {
                entryPoints: [
                    resource.ssl
                        ? config.getRawConfig().traefik.https_entrypoint
                        : config.getRawConfig().traefik.http_entrypoint
                ],
                middlewares: routerMiddlewares,
                service: serviceName,
                rule: rule,
                priority: priority,
                ...(resource.ssl ? { tls } : {})
            };

            if (resource.ssl) {
                config_output.http.routers![routerName + "-redirect"] = {
                    entryPoints: [
                        config.getRawConfig().traefik.http_entrypoint
                    ],
                    middlewares: [redirectHttpsMiddlewareName],
                    service: serviceName,
                    rule: rule,
                    priority: priority
                };
            }

            config_output.http.services![serviceName] = {
                loadBalancer: {
                    servers: (() => {
                        // Check if any sites are online
                        // THIS IS SO THAT THERE IS SOME IMMEDIATE FEEDBACK
                        // EVEN IF THE SITES HAVE NOT UPDATED YET FROM THE
                        // RECEIVE BANDWIDTH ENDPOINT.

                        // TODO: HOW TO HANDLE ^^^^^^ BETTER
                        const anySitesOnline = (
                            targets as TargetWithSite[]
                        ).some((target: TargetWithSite) => target.site.online);

                        return (
                            (targets as TargetWithSite[])
                            .filter((target: TargetWithSite) => {
                                    if (!target.enabled) {
                                        return false;
                                    }

                                    // If any sites are online, exclude offline sites
                                    if (anySitesOnline && !target.site.online) {
                                        return false;
                                    }

                                    if (
                                        target.site.type === "local" ||
                                        target.site.type === "wireguard"
                                    ) {
                                        if (
                                            !target.ip ||
                                            !target.port ||
                                            !target.method
                                        ) {
                                            return false;
                                        }
                                } else if (target.site.type === "newt") {
                                        if (
                                            !target.internalPort ||
                                            !target.method ||
                                            !target.site.subnet
                                        ) {
                                            return false;
                                        }
                                }
                                return true;
                            })
                            .map((target: TargetWithSite) => {
                                    if (
                                        target.site.type === "local" ||
                                        target.site.type === "wireguard"
                                    ) {
                                        return {
                                            url: `${target.method}://${target.ip}:${target.port}`
                                        };
                                } else if (target.site.type === "newt") {
                                        const ip =
                                            target.site.subnet!.split("/")[0];
                                        return {
                                            url: `${target.method}://${ip}:${target.internalPort}`
                                        };
                                }
                            })
                                // filter out duplicates
                                .filter(
                                    (v, i, a) =>
                                        a.findIndex(
                                            (t) => t && v && t.url === v.url
                                        ) === i
                                )
                        );
                    })(),
                    ...(resource.stickySession
                        ? {
                              sticky: {
                                  cookie: {
                                      name: "p_sticky", // TODO: make this configurable via config.yml like other cookies
                                      secure: resource.ssl,
                                      httpOnly: true
                                  }
                              }
                          }
                        : {})
                }
            };

            // Add the serversTransport if TLS server name is provided
            if (resource.tlsServerName) {
                if (!config_output.http.serversTransports) {
                    config_output.http.serversTransports = {};
                }
                config_output.http.serversTransports![transportName] = {
                    serverName: resource.tlsServerName,
                    //unfortunately the following needs to be set. traefik doesn't merge the default serverTransport settings
                    // if defined in the static config and here. if not set, self-signed certs won't work
                    insecureSkipVerify: true
                };
                config_output.http.services![
                    serviceName
                ].loadBalancer.serversTransport = transportName;
            }
        } else {
            // Non-HTTP (TCP/UDP) configuration
            if (!resource.enableProxy) {
                continue;
            }

            const protocol = resource.protocol.toLowerCase();
            const port = resource.proxyPort;

            if (!port) {
                continue;
            }

            if (!config_output[protocol]) {
                config_output[protocol] = {
                    routers: {},
                    services: {}
                };
            }

            config_output[protocol].routers[routerName] = {
                entryPoints: [`${protocol}-${port}`],
                service: serviceName,
                ...(protocol === "tcp" ? { rule: "HostSNI(`*`)" } : {})
            };

            config_output[protocol].services[serviceName] = {
                loadBalancer: {
                    servers: (() => {
                        // Check if any sites are online
                        const anySitesOnline = (
                            targets as TargetWithSite[]
                        ).some((target: TargetWithSite) => target.site.online);

                        return (targets as TargetWithSite[])
                            .filter((target: TargetWithSite) => {
                                if (!target.enabled) {
                                    return false;
                                }

                                // If any sites are online, exclude offline sites
                                if (anySitesOnline && !target.site.online) {
                                    return false;
                                }

                                if (
                                    target.site.type === "local" ||
                                    target.site.type === "wireguard"
                                ) {
                                    if (!target.ip || !target.port) {
                                        return false;
                                    }
                                } else if (target.site.type === "newt") {
                                    if (
                                        !target.internalPort ||
                                        !target.site.subnet
                                    ) {
                                        return false;
                                    }
                                }
                                return true;
                            })
                            .map((target: TargetWithSite) => {
                                if (
                                    target.site.type === "local" ||
                                    target.site.type === "wireguard"
                                ) {
                                    return {
                                        address: `${target.ip}:${target.port}`
                                    };
                                } else if (target.site.type === "newt") {
                                    const ip =
                                        target.site.subnet!.split("/")[0];
                                    return {
                                        address: `${ip}:${target.internalPort}`
                                    };
                                }
                            });
                    })(),
                    ...(resource.stickySession
                        ? {
                              sticky: {
                                  ipStrategy: {
                                      depth: 0,
                                      sourcePort: true
                                  }
                              }
                          }
                        : {})
                }
            };
        }
    }

    if (generateLoginPageRouters) {
        const exitNodeLoginPages = await db
            .select({
                loginPageId: loginPage.loginPageId,
                fullDomain: loginPage.fullDomain,
                exitNodeId: exitNodes.exitNodeId,
                domainId: loginPage.domainId,
                certificateStatus: certificates.status
            })
            .from(loginPage)
            .innerJoin(
                exitNodes,
                eq(exitNodes.exitNodeId, loginPage.exitNodeId)
            )
            .leftJoin(
                certificates,
                eq(certificates.domainId, loginPage.domainId)
            )
            .where(eq(exitNodes.exitNodeId, exitNodeId));

        if (exitNodeLoginPages.length > 0) {
            if (!config_output.http.services) {
                config_output.http.services = {};
            }

            if (!config_output.http.services["landing-service"]) {
                config_output.http.services["landing-service"] = {
                    loadBalancer: {
                        servers: [
                            {
                                url: `http://${
                                    config.getRawConfig().server
                                        .internal_hostname
                                }:${config.getRawConfig().server.next_port}`
                            }
                        ]
                    }
                };
            }

            for (const lp of exitNodeLoginPages) {
                if (!lp.domainId) {
                    continue;
                }

                if (!lp.fullDomain) {
                    continue;
                }

                if (lp.certificateStatus !== "valid") {
                    continue;
                }

                // auth-allowed:
                //     rule: "Host(`auth.pangolin.internal`) && (PathRegexp(`^/auth/resource/[0-9]+$`) || PathPrefix(`/_next`))"
                //     service: next-service
                //     entryPoints:
                //         - websecure

                const routerName = `loginpage-${lp.loginPageId}`;
                const fullDomain = `${lp.fullDomain}`;

                if (!config_output.http.routers) {
                    config_output.http.routers = {};
                }

                config_output.http.routers![routerName + "-router"] = {
                    entryPoints: [
                        config.getRawConfig().traefik.https_entrypoint
                    ],
                    service: "landing-service",
                    rule: `Host(\`${fullDomain}\`) && (PathRegexp(\`^/auth/resource/[^/]+$\`) || PathRegexp(\`^/auth/idp/[0-9]+/oidc/callback\`) || PathPrefix(\`/_next\`) || Path(\`/auth/org\`) || PathRegexp(\`^/__nextjs*\`))`,
                    priority: 203,
                    tls: {}
                };

                // auth-catchall:
                //   rule: "Host(`auth.example.com`)"
                //   middlewares:
                //     - redirect-to-root
                //   service: next-service
                //   entryPoints:
                //     - web

                config_output.http.routers![routerName + "-catchall"] = {
                    entryPoints: [
                        config.getRawConfig().traefik.https_entrypoint
                    ],
                    middlewares: [redirectToRootMiddlewareName],
                    service: "landing-service",
                    rule: `Host(\`${fullDomain}\`)`,
                    priority: 202,
                    tls: {}
                };

                // we need to add a redirect from http to https too
                config_output.http.routers![routerName + "-redirect"] = {
                    entryPoints: [
                        config.getRawConfig().traefik.http_entrypoint
                    ],
                    middlewares: [redirectHttpsMiddlewareName],
                    service: "landing-service",
                    rule: `Host(\`${fullDomain}\`)`,
                    priority: 201
                };
            }
        }
    }

    return config_output;
}