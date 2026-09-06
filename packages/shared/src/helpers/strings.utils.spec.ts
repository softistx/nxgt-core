import { describe, expect, it } from 'bun:test';
import { Types } from 'mongoose';
import {
	hexaHash,
	isNumericString,
	normalizeUrl,
	objectFromString,
	toObjectId,
	toObjectIds,
} from './strings.utils';

describe('isNumericString', () => {
	it('should return true for valid numeric strings', () => {
		expect(isNumericString('123')).toBeTrue();
		expect(isNumericString('0')).toBeTrue();
		expect(isNumericString('999')).toBeTrue();
	});

	it('should return false for non-numeric strings', () => {
		expect(isNumericString('abc')).toBe(false);
		expect(isNumericString('12a')).toBe(false);
		expect(isNumericString('')).toBe(false);
		expect(isNumericString(' ')).toBe(false);
	});

	it('should return false for undefined', () => {
		expect(isNumericString(undefined)).toBe(false);
	});
});

describe('objectFromString', () => {
	it('should parse valid JSON string', () => {
		const obj = { key: 'value' };
		expect(objectFromString(JSON.stringify(obj))).toEqual(obj);
	});

	it('should return empty object for invalid JSON', () => {
		expect(objectFromString('invalid json')).toEqual({});
		expect(objectFromString('')).toEqual({});
		expect(objectFromString('{invalid')).toEqual({});
	});
});

describe('toObjectId', () => {
	it('should create a valid ObjectId', () => {
		const id = '507f1f77bcf86cd799439011';
		const objId = toObjectId(id);
		expect(objId).toBeInstanceOf(Types.ObjectId);
		expect(objId.toString()).toBe(id);
	});

	it('should throw for invalid ObjectId string', () => {
		expect(() => toObjectId('invalid')).toThrow();
	});
});

describe('toObjectIds', () => {
	it('should convert array of strings to ObjectIds', () => {
		const ids = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];
		const objIds = toObjectIds(ids);
		expect(objIds).toHaveLength(2);
		expect(objIds[0]).toBeInstanceOf(Types.ObjectId);
		expect(objIds[1]).toBeInstanceOf(Types.ObjectId);
	});

	it('should handle empty array', () => {
		expect(toObjectIds([])).toEqual([]);
	});
});

describe('hexaHash', () => {
	it('should return a string hash for string input', () => {
		const hash = hexaHash('test');
		expect(typeof hash).toBe('string');
		expect(hash.length).toBeGreaterThan(0);
	});

	it('should return a string hash for object input', () => {
		const obj = { key: 'value' };
		const hash1 = hexaHash(obj);
		const hash2 = hexaHash(JSON.stringify(obj));
		expect(typeof hash1).toBe('string');
		expect(hash1).toBe(hash2); // Same result for equivalent data
	});

	it('should produce consistent hashes', () => {
		const data = 'consistent';
		expect(hexaHash(data)).toBe(hexaHash(data));
	});
});

describe('normalizeUrl', () => {
	it('should replace multiple consecutive slashes with single slash', () => {
		expect(normalizeUrl('http://example.com//path')).toBe(
			'http://example.com/path',
		);
		expect(normalizeUrl('http://example.com///path')).toBe(
			'http://example.com/path',
		);
	});

	it('should preserve protocol slashes', () => {
		expect(normalizeUrl('https://example.com/path')).toBe(
			'https://example.com/path',
		);
	});

	it('should handle multiple occurrences', () => {
		expect(normalizeUrl('http://example.com//path//to')).toBe(
			'http://example.com/path/to',
		);
	});
});
