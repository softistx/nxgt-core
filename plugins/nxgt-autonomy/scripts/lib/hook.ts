/**
 * The shell a hook runs in: read the event from stdin, run, print at most one
 * JSON object, and exit 0 whatever happens. The plugin never changes a
 * permission or a mode and never blocks: an error is reported as a
 * `systemMessage` and the session goes on as if the hook were absent.
 */

import { disabled } from './mandate';

export interface HookInput {
	readonly session_id?: string;
	readonly cwd?: string;
	readonly hook_event_name?: string;
	readonly source?: string;
}

export type HookOutput = Record<string, unknown>;

export async function runHook(
	name: string,
	handler: (input: HookInput) => HookOutput | undefined,
): Promise<never> {
	let output: HookOutput | undefined;
	try {
		if (!disabled(process.env)) {
			const input = JSON.parse(await Bun.stdin.text()) as HookInput;
			output = handler(input);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		output = {
			systemMessage: `nxgt-autonomy: the ${name} hook failed and did nothing (${message.slice(0, 200)}).`,
		};
	}
	if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
	process.exit(0);
}
