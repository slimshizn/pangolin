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

// Simple test file for the rate limit service with Redis
// Run with: npx ts-node rateLimitService.test.ts

import { RateLimitService } from './rateLimit';

function generateClientId() {
    return 'client-' + Math.random().toString(36).substring(2, 15);
}

async function runTests() {
    console.log('Starting Rate Limit Service Tests...\n');
    
    const rateLimitService = new RateLimitService();
    let testsPassed = 0;
    let testsTotal = 0;

    // Helper function to run a test
    async function test(name: string, testFn: () => Promise<void>) {
        testsTotal++;
        try {
            await testFn();
            console.log(`✅ ${name}`);
            testsPassed++;
        } catch (error) {
            console.log(`❌ ${name}: ${error}`);
        }
    }

    // Helper function for assertions
    function assert(condition: boolean, message: string) {
        if (!condition) {
            throw new Error(message);
        }
    }

    // Test 1: Basic rate limiting
    await test('Should allow requests under the limit', async () => {
        const clientId = generateClientId();
        const maxRequests = 5;

        for (let i = 0; i < maxRequests - 1; i++) {
            const result = await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
            assert(!result.isLimited, `Request ${i + 1} should be allowed`);
            assert(result.totalHits === i + 1, `Expected ${i + 1} hits, got ${result.totalHits}`);
        }
    });

    // Test 2: Rate limit blocking
    await test('Should block requests over the limit', async () => {
        const clientId = generateClientId();
        const maxRequests = 30;

        // Use up all allowed requests
        for (let i = 0; i < maxRequests - 1; i++) {
            const result = await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
            assert(!result.isLimited, `Request ${i + 1} should be allowed`);
        }

        // Next request should be blocked
        const blockedResult = await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        assert(blockedResult.isLimited, 'Request should be blocked');
        assert(blockedResult.reason === 'global', 'Should be blocked for global reason');
    });

    // Test 3: Message type limits
    await test('Should handle message type limits', async () => {
        const clientId = generateClientId();
        const globalMax = 10;
        const messageTypeMax = 2;

        // Send messages of type 'ping' up to the limit
        for (let i = 0; i < messageTypeMax - 1; i++) {
            const result = await rateLimitService.checkRateLimit(
                clientId, 
                'ping', 
                globalMax, 
                messageTypeMax
            );
            assert(!result.isLimited, `Ping message ${i + 1} should be allowed`);
        }

        // Next 'ping' should be blocked
        const blockedResult = await rateLimitService.checkRateLimit(
            clientId, 
            'ping', 
            globalMax, 
            messageTypeMax
        );
        assert(blockedResult.isLimited, 'Ping message should be blocked');
        assert(blockedResult.reason === 'message_type:ping', 'Should be blocked for message type');

        // Other message types should still work
        const otherResult = await rateLimitService.checkRateLimit(
            clientId, 
            'pong', 
            globalMax, 
            messageTypeMax
        );
        assert(!otherResult.isLimited, 'Pong message should be allowed');
    });

    // Test 4: Reset functionality
    await test('Should reset client correctly', async () => {
        const clientId = generateClientId();
        const maxRequests = 3;

        // Use up some requests
        await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        await rateLimitService.checkRateLimit(clientId, 'test', maxRequests);

        // Reset the client
        await rateLimitService.resetKey(clientId);

        // Should be able to make fresh requests
        const result = await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        assert(!result.isLimited, 'Request after reset should be allowed');
        assert(result.totalHits === 1, 'Should have 1 hit after reset');
    });

    // Test 5: Different clients are independent
    await test('Should handle different clients independently', async () => {
        const client1 = generateClientId();
        const client2 = generateClientId();
        const maxRequests = 2;

        // Client 1 uses up their limit
        await rateLimitService.checkRateLimit(client1, undefined, maxRequests);
        await rateLimitService.checkRateLimit(client1, undefined, maxRequests);
        const client1Blocked = await rateLimitService.checkRateLimit(client1, undefined, maxRequests);
        assert(client1Blocked.isLimited, 'Client 1 should be blocked');

        // Client 2 should still be able to make requests
        const client2Result = await rateLimitService.checkRateLimit(client2, undefined, maxRequests);
        assert(!client2Result.isLimited, 'Client 2 should not be blocked');
        assert(client2Result.totalHits === 1, 'Client 2 should have 1 hit');
    });

    // Test 6: Decrement functionality
    await test('Should decrement correctly', async () => {
        const clientId = generateClientId();
        const maxRequests = 5;

        // Make some requests
        await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        let result = await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        assert(result.totalHits === 3, 'Should have 3 hits before decrement');

        // Decrement
        await rateLimitService.decrementRateLimit(clientId);

        // Next request should reflect the decrement
        result = await rateLimitService.checkRateLimit(clientId, undefined, maxRequests);
        assert(result.totalHits === 3, 'Should have 3 hits after decrement + increment');
    });

    // Wait a moment for any pending Redis operations
    console.log('\nWaiting for Redis sync...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Force sync to test Redis integration
    await test('Should sync to Redis', async () => {
        await rateLimitService.forceSyncAllPendingData();
        // If this doesn't throw, Redis sync is working
        assert(true, 'Redis sync completed');
    });

    // Cleanup
    await rateLimitService.cleanup();

    // Results
    console.log(`\n--- Test Results ---`);
    console.log(`✅ Passed: ${testsPassed}/${testsTotal}`);
    console.log(`❌ Failed: ${testsTotal - testsPassed}/${testsTotal}`);
    
    if (testsPassed === testsTotal) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n💥 Some tests failed!');
        process.exit(1);
    }
}

// Run the tests
runTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});