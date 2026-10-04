/**
 * The shell a hook runs in: read the event from stdin, run, print at most one
 * JSON object, and exit 0 whatever happens. The plugin never changes a
 * permission and never blocks: an error is reported as a `systemMessage` and
 * the session goes on as if the hook were absent.
 */

import { disabled } from './economy';

/** The fields of the event the hooks read; each hook narrows what it needs. */
export interface HookInput {
	readonly tool_name?: string;
	readonly tool_input?: Record<string, unknown>;
}

export type HookOutput = Record<string, unknown>;

export async function runHook(
	name: string,
	handler: (input: HookInput) => HookOutput | undefined,
): Promise<never> {
	let output: HookOutput | undefined;
	try {
		if (!disabled(process.env)) {
			const text = await Bun.stdin.text();
			output = handler(text.trim() ? (JSON.parse(text) as HookInput) : {});
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		output = {
			systemMessage: `nxgt-economy: the ${name} hook failed and did nothing (${message.slice(0, 200)}).`,
		};
	}
	if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
	process.exit(0);
}
