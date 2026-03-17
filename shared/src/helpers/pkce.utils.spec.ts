import { beforeEach, describe, expect, it, mock } from 'bun:test';
import {
	generateCodeChallenge,
	generateCodeVerifier,
	verifyPkce,
} from './pkce.utils';

// Mock crypto for deterministic testing
let callCount = 0;
const mockGetRandomValues = mock((array: Uint8Array) => {
	// Fill with predictable bytes for testing (incrementing pattern for uniqueness)
	for (let i = 0; i < array.length; i++) {
		array[i] = (i + callCount * 32) % 256;
	}
	callCount++;
	return array;
});

const mockDigest = mock(async (_algorithm: string, data: Uint8Array) => {
	// Mock SHA-256 digest: simple hash simulation for testing
	const hash = new Uint8Array(32);
	if (data.length === 0) {
		// SHA-256 of empty string
		const emptyHash = new Uint8Array([
			0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8,
			0x99, 0x6f, 0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c,
			0xa4, 0x95, 0x99, 0x1b, 0x78, 0x52, 0xb8, 0x55,
		]);
		return emptyHash.buffer;
	}
	for (let i = 0; i < 32; i++) {
		hash[i] = (data[i % data.length] ?? 0 + i) % 256;
	}
	return hash.buffer;
});

beforeEach(() => {
	// Reset mocks
	mockGetRandomValues.mockClear();
	mockDigest.mockClear();

	// Spy on crypto globals
	(globalThis as any).crypto = {
		getRandomValues: mockGetRandomValues,
		subtle: {
			digest: mockDigest,
		},
	};
});

describe('generateCodeVerifier', () => {
	it('should generate a verifier with default 32-byte length (43 chars)', () => {
		const verifier = generateCodeVerifier();
		expect(verifier).toHaveLength(43);
		expect(typeof verifier).toBe('string');
		expect(mockGetRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
		const callArgs = mockGetRandomValues.mock.calls[0]?.[0];
		expect(callArgs).toHaveLength(32);
	});

	it('should generate a verifier with custom byte length (min 32)', () => {
		const verifier = generateCodeVerifier(32);
		expect(verifier).toHaveLength(43); // 32 bytes -> 43 base64url chars
	});

	it('should generate a verifier with custom byte length (max 96)', () => {
		const verifier = generateCodeVerifier(96);
		expect(verifier).toHaveLength(128); // 96 bytes -> 128 base64url chars
	});

	it('should produce unique verifiers on multiple calls', () => {
		const verifier1 = generateCodeVerifier(32);
		const verifier2 = generateCodeVerifier(32);
		expect(verifier1).not.toBe(verifier2); // Mocks return same data, but in real usage they'd differ
	});

	it('should generate valid base64url format (no +, /, or padding)', () => {
		const verifier = generateCodeVerifier(32);
		expect(verifier).not.toMatch(/[+/=]/);
		expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});

describe('generateCodeChallenge', () => {
	it('should return verifier unchanged for plain method', async () => {
		const verifier = 'test-verifier';
		const challenge = await generateCodeChallenge(verifier, 'plain');
		expect(challenge).toBe(verifier);
		expect(mockDigest).not.toHaveBeenCalled();
	});

	it('should generate SHA-256 challenge for S256 method', async () => {
		const verifier = 'test-verifier';
		const challenge = await generateCodeChallenge(verifier, 'S256');
		expect(challenge).toBeDefined();
		expect(typeof challenge).toBe('string');
		expect(challenge.length).toBe(43); // SHA-256 digest -> 43 base64url chars
		expect(mockDigest).toHaveBeenCalledWith(
			'SHA-256',
			new TextEncoder().encode(verifier),
		);
	});

	it('should default to S256 method if not specified', async () => {
		const verifier = 'test-verifier';
		const challenge = await generateCodeChallenge(verifier);
		expect(challenge).toBeDefined();
		expect(mockDigest).toHaveBeenCalledWith(
			'SHA-256',
			new TextEncoder().encode(verifier),
		);
	});

	it('should handle empty verifier', async () => {
		const challenge = await generateCodeChallenge('', 'S256');
		expect(challenge).toBeDefined();
		expect(mockDigest).toHaveBeenCalledWith('SHA-256', new Uint8Array(0));
	});
});

describe('verifyPkce', () => {
	it('should verify valid S256 challenge', async () => {
		const verifier = 'test-verifier';
		const challenge = await generateCodeChallenge(verifier, 'S256');
		const isValid = await verifyPkce('S256', verifier, challenge);
		expect(isValid).toBe(true);
	});

	it('should verify valid plain challenge', async () => {
		const verifier = 'test-verifier';
		const challenge = await generateCodeChallenge(verifier, 'plain');
		const isValid = await verifyPkce('plain', verifier, challenge);
		expect(isValid).toBe(true);
	});

	it('should reject invalid verifier for S256', async () => {
		const validVerifier = 'valid-verifier';
		const challenge = await generateCodeChallenge(validVerifier, 'S256');
		const invalidVerifier = 'invalid-verifier';
		const isValid = await verifyPkce('S256', invalidVerifier, challenge);
		expect(isValid).toBe(false);
	});

	it('should reject invalid challenge for S256', async () => {
		const verifier = 'test-verifier';
		const invalidChallenge = 'invalid-challenge';
		const isValid = await verifyPkce('S256', verifier, invalidChallenge);
		expect(isValid).toBe(false);
	});

	it('should reject invalid verifier for plain', async () => {
		const challenge = 'valid-challenge';
		const invalidVerifier = 'invalid-verifier';
		const isValid = await verifyPkce('plain', invalidVerifier, challenge);
		expect(isValid).toBe(false);
	});

	it('should handle empty strings', async () => {
		const isValid = await verifyPkce('S256', '', '');
		expect(isValid).toBe(false); // Empty verifier does not match empty challenge
	});

	it('should handle mismatched method', async () => {
		const verifier = 'test-verifier';
		const s256Challenge = await generateCodeChallenge(verifier, 'S256');
		const isValid = await verifyPkce('plain', verifier, s256Challenge);
		expect(isValid).toBe(false);
	});
});
