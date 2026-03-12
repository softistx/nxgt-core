import { describe, expect, it } from 'vitest';
import { DATE_UTILS } from './date.utils';

describe('DATE_UTILS', () => {
	describe('format', () => {
		it('formats valid ISO string with default format', () => {
			const result = DATE_UTILS.format('2023-10-01T00:00:00.000Z');
			expect(result).toBe('Oct 1, 2023');
		});

		it('returns "-" for null', () => {
			expect(DATE_UTILS.format(null)).toBe('-');
		});

		it('returns "-" for undefined', () => {
			expect(DATE_UTILS.format(undefined)).toBe('-');
		});

		it('formats with custom format', () => {
			const result = DATE_UTILS.format(
				'2023-10-01T00:00:00.000Z',
				'yyyy-MM-dd',
			);
			expect(result).toBe('2023-10-01');
		});
	});

	describe('parseFromTimestring', () => {
		it('parses time string correctly', () => {
			const result = DATE_UTILS.parseFromTimestring('14:30');
			expect(result.getHours()).toBe(14);
			expect(result.getMinutes()).toBe(30);
		});

		it('parses midnight time', () => {
			const result = DATE_UTILS.parseFromTimestring('00:00');
			expect(result.getHours()).toBe(0);
			expect(result.getMinutes()).toBe(0);
		});
	});

	describe('parseFromISOString', () => {
		it('parses valid ISO string', () => {
			const result = DATE_UTILS.parseFromISOString('2023-10-01T00:00:00.000Z');
			expect(result).toEqual(new Date('2023-10-01T00:00:00.000Z'));
		});

		it('returns null for undefined', () => {
			expect(DATE_UTILS.parseFromISOString(undefined)).toBeNull();
		});
	});
});
