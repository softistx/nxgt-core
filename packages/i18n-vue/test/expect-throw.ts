import { expect } from 'bun:test';

/**
 * Asserts `run` throws exactly `kind` — not a subclass, not a parent — with
 * exactly `message`. Bun's `toThrow(new TypeError(m))` compares the message
 * alone, so an `Error` would pass for a `TypeError`, and the split between a
 * wiring mistake and a failure would be enforced by nothing.
 */
export function expectThrow(
	run: () => unknown,
	kind: ErrorConstructor | TypeErrorConstructor,
	message: string,
): Error {
	let caught: unknown;
	try {
		run();
	} catch (error) {
		caught = error;
	}
	expect(caught).toBeInstanceOf(Error);
	expect((caught as Error).constructor).toBe(kind);
	expect((caught as Error).message).toBe(message);
	return caught as Error;
}
