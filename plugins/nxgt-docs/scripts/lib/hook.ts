/**
 * The shell the Stop hook runs in: read the event from stdin, run, print at
 * most one JSON object, and exit 0 whatever happens. It fails open and
 * silently — an error, unreadable input or `NXGT_DOCS_DISABLE=1` lets the turn
 * end as if the hook were absent, since a warning on every turn is noise.
 */

export interface StopInput {
	readonly session_id?: unknown;
	readonly cwd?: unknown;
	readonly transcript_path?: unknown;
	readonly stop_hook_active?: unknown;
}

export type HookOutput = Record<string, unknown>;

/** `NXGT_DOCS_DISABLE=1` (or `true`) turns the hook off. */
export function disabled(env: Record<string, string | undefined>): boolean {
	const value = env['NXGT_DOCS_DISABLE']?.trim().toLowerCase();
	return value === '1' || value === 'true';
}

export async function runHook(
	handler: (input: StopInput) => HookOutput | undefined,
): Promise<never> {
	let output: HookOutput | undefined;
	try {
		if (!disabled(process.env)) {
			const value: unknown = JSON.parse(await Bun.stdin.text());
			if (value && typeof value === 'object')
				output = handler(value as StopInput);
		}
	} catch {
		output = undefined;
	}
	if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
	process.exit(0);
}
