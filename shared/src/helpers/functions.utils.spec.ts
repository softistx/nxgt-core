import { describe, expect, it } from 'bun:test';
import { expr, parseFunction } from './functions.utils';

describe('parseFunction', () => {
	it('should parse traditional function with multiple arguments', () => {
		function testFn(a: number, b: string) {
			return a + b;
		}

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['a', 'b']);
		expect(result.body).toContain('return a + b;');
	});

	it('should parse traditional function with no arguments', () => {
		function testFn() {
			return 'hello';
		}

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['']);
		expect(result.body).toContain('return "hello";');
	});

	it('should parse arrow function with single argument (no parentheses)', () => {
		const testFn = (a: number) => a * 2;

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['a']);
		expect(result.body).toMatch(/return\s+a\s*\*\s*2;/);
	});

	it('should parse arrow function with multiple arguments', () => {
		const testFn = (a: number, b: number) => a + b;

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['a', 'b']);
		expect(result.body).toMatch(/return\s+a\s*\+\s*b;/);
	});

	it('should parse arrow function with braced body', () => {
		const testFn = (a: number) => {
			return a * 2;
		};

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['a']);
		expect(result.body).toContain('return a * 2;');
	});

	it('should parse arrow function with implicit return', () => {
		const testFn = (a: number) => a + 1;

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['a']);
		expect(result.body).toMatch(/return\s+a\s*\+\s*1;/);
	});

	it('should handle whitespace in arguments', () => {
		const testFn = (a: number, b: string) => a + b;

		const result = parseFunction(testFn);
		expect(result.args).toEqual(['a', 'b']);
		expect(result.body).toMatch(/return\s+a\s*\+\s*b;/);
	});
});

describe('expr', () => {
	it('should create and execute a simple function (no args)', () => {
		const fn = expr('return "hello";');
		expect(fn()).toBe('hello');
	});

	it('should create and execute function with arguments', () => {
		const fn = expr('return a + b;', 'a', 'b');
		expect(fn(2, 3)).toBe(5);
	});

	it('should return expected value from execution', () => {
		const fn = expr('return 42;');
		expect(fn(10)).toBe(42);
	});
});

describe('parseFunction and expr integration', () => {
	it('should parse and recreate arrow function with multiple args', () => {
		const original = (a: number, b: number) => a + b;
		const parsed = parseFunction(original);
		const recreated = expr(parsed.body, ...parsed.args);
		expect(recreated(2, 3)).toBe(original(2, 3));
	});

	it('should parse and recreate traditional function with args', () => {
		function original(a: number, b: number) {
			return a * b;
		}
		const parsed = parseFunction(original);
		const recreated = expr(parsed.body, ...parsed.args);
		expect(recreated(4, 5)).toBe(original(4, 5));
	});

	it('should parse and recreate arrow function with no args', () => {
		const original = () => 'hello world';
		const parsed = parseFunction(original);
		const recreated = expr(parsed.body, ...parsed.args);
		expect(recreated()).toBe(original());
	});

	it('should parse and recreate arrow function with braced body', () => {
		const original = (x: number) => {
			return x * 2 + 1;
		};
		const parsed = parseFunction(original);
		const recreated = expr(parsed.body, ...parsed.args);
		expect(recreated(3)).toBe(original(3));
	});
});
