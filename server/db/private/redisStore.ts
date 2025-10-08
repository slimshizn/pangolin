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

import { Store, Options, IncrementResponse } from 'express-rate-limit';
import { rateLimitService } from './rateLimit';
import logger from '@server/logger';

/**
 * A Redis-backed rate limiting store for express-rate-limit that optimizes
 * for local read performance and batched writes to Redis.
 *
 * This store uses the same optimized rate limiting logic as the WebSocket
 * implementation, providing:
 * - Local caching for fast reads
 * - Batched writes to Redis to reduce load
 * - Automatic cleanup of expired entries
 * - Graceful fallback when Redis is unavailable
 */
export default class RedisStore implements Store {
    /**
     * The duration of time before which all hit counts are reset (in milliseconds).
     */
    windowMs!: number;

    /**
     * Maximum number of requests allowed within the window.
     */
    max!: number;

    /**
     * Optional prefix for Redis keys to avoid collisions.
     */
    prefix: string;

    /**
     * Whether to skip incrementing on failed requests.
     */
    skipFailedRequests: boolean;

    /**
     * Whether to skip incrementing on successful requests.
     */
    skipSuccessfulRequests: boolean;

    /**
     * @constructor for RedisStore.
     *
     * @param options - Configuration options for the store.
     */
    constructor(options: {
        prefix?: string;
        skipFailedRequests?: boolean;
        skipSuccessfulRequests?: boolean;
    } = {}) {
        this.prefix = options.prefix || 'express-rate-limit';
        this.skipFailedRequests = options.skipFailedRequests || false;
        this.skipSuccessfulRequests = options.skipSuccessfulRequests || false;
    }

    /**
     * Method that actually initializes the store. Must be synchronous.
     *
     * @param options - The options used to setup express-rate-limit.
     */
    init(options: Options): void {
        this.windowMs = options.windowMs;
        this.max = options.max as number;

        // logger.debug(`RedisStore initialized with windowMs: ${this.windowMs}, max: ${this.max}, prefix: ${this.prefix}`);
    }

    /**
     * Method to increment a client's hit counter.
     *
     * @param key - The identifier for a client (usually IP address).
     * @returns Promise resolving to the number of hits and reset time for that client.
     */
    async increment(key: string): Promise<IncrementResponse> {
        try {
            const clientId = `${this.prefix}:${key}`;

            const result = await rateLimitService.checkRateLimit(
                clientId,
                undefined, // No message type for HTTP requests
                this.max,
                undefined, // No message type limit
                this.windowMs
            );

            // logger.debug(`Incremented rate limit for key: ${key} with max: ${this.max}, totalHits: ${result.totalHits}`);

            return {
                totalHits: result.totalHits || 1,
                resetTime: result.resetTime || new Date(Date.now() + this.windowMs)
            };
        } catch (error) {
            logger.error(`RedisStore increment error for key ${key}:`, error);

            // Return safe defaults on error to prevent blocking requests
            return {
                totalHits: 1,
                resetTime: new Date(Date.now() + this.windowMs)
            };
        }
    }

    /**
     * Method to decrement a client's hit counter.
     * Used when skipSuccessfulRequests or skipFailedRequests is enabled.
     *
     * @param key - The identifier for a client.
     */
    async decrement(key: string): Promise<void> {
        try {
            const clientId = `${this.prefix}:${key}`;
            await rateLimitService.decrementRateLimit(clientId);

            // logger.debug(`Decremented rate limit for key: ${key}`);
        } catch (error) {
            logger.error(`RedisStore decrement error for key ${key}:`, error);
            // Don't throw - decrement failures shouldn't block requests
        }
    }

    /**
     * Method to reset a client's hit counter.
     *
     * @param key - The identifier for a client.
     */
    async resetKey(key: string): Promise<void> {
        try {
            const clientId = `${this.prefix}:${key}`;
            await rateLimitService.resetKey(clientId);

            // logger.debug(`Reset rate limit for key: ${key}`);
        } catch (error) {
            logger.error(`RedisStore resetKey error for key ${key}:`, error);
            // Don't throw - reset failures shouldn't block requests
        }
    }

    /**
     * Method to reset everyone's hit counter.
     *
     * This method is optional and is never called by express-rate-limit.
     * We implement it for completeness but it's not recommended for production use
     * as it could be expensive with large datasets.
     */
    async resetAll(): Promise<void> {
        try {
            logger.warn('RedisStore resetAll called - this operation can be expensive');

            // Force sync all pending data first
            await rateLimitService.forceSyncAllPendingData();

            // Note: We don't actually implement full reset as it would require
            // scanning all Redis keys with our prefix, which could be expensive.
            // In production, it's better to let entries expire naturally.

            logger.info('RedisStore resetAll completed (pending data synced)');
        } catch (error) {
            logger.error('RedisStore resetAll error:', error);
            // Don't throw - this is an optional method
        }
    }

    /**
     * Get current hit count for a key without incrementing.
     * This is a custom method not part of the Store interface.
     *
     * @param key - The identifier for a client.
     * @returns Current hit count and reset time, or null if no data exists.
     */
    async getHits(key: string): Promise<{ totalHits: number; resetTime: Date } | null> {
        try {
            const clientId = `${this.prefix}:${key}`;

            // Use checkRateLimit with max + 1 to avoid actually incrementing
            // but still get the current count
            const result = await rateLimitService.checkRateLimit(
                clientId,
                undefined,
                this.max + 1000, // Set artificially high to avoid triggering limit
                undefined,
                this.windowMs
            );

            // Decrement since we don't actually want to count this check
            await rateLimitService.decrementRateLimit(clientId);

            return {
                totalHits: Math.max(0, (result.totalHits || 0) - 1), // Adjust for the decrement
                resetTime: result.resetTime || new Date(Date.now() + this.windowMs)
            };
        } catch (error) {
            logger.error(`RedisStore getHits error for key ${key}:`, error);
            return null;
        }
    }

    /**
     * Cleanup method for graceful shutdown.
     * This is not part of the Store interface but is useful for cleanup.
     */
    async shutdown(): Promise<void> {
        try {
            // The rateLimitService handles its own cleanup
            logger.info('RedisStore shutdown completed');
        } catch (error) {
            logger.error('RedisStore shutdown error:', error);
        }
    }
}
