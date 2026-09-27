/**
 * The thin shell every hook shares: read the event from stdin, run, print one
 * JSON object, and exit 0 — whatever happens. A registry error is reported as
 * a `systemMessage` warning and the tool call goes ahead: this plugin must
 * never be the reason work stops, except through a deliberate `deny`.
 */

export interface HookInput {
	readonly session_id?: string;
	readonly cwd?: string;
	readonly hook_event_name?: string;
	readonly tool_name?: string;
	readonly tool_input?: Record<string, unknown>;
	readonly tool_response?: unknown;
	readonly scratchpad_dir?: string;
	readonly session_title?: string;
	readonly source?: string;
	readonly agent_id?: string;
}

export type HookOutput = Record<string, unknown>;

/** The input once `runHook` has checked it names a session. */
export type SessionInput = HookInput & { readonly session_id: string };

export function disabled(env: Record<string, string | undefined>): boolean {
	return env.NXGT_CREW_DISABLE === '1' || env.NXGT_CREW_DISABLE === 'true';
}

export async function runHook(
	handler: (input: SessionInput) => Promise<HookOutput | undefined>,
): Promise<never> {
	let output: HookOutput | undefined;
	try {
		if (!disabled(process.env)) {
			const raw = await Bun.stdin.text();
			const input = JSON.parse(raw) as HookInput;
			if (typeof input.session_id === 'string' && input.session_id) {
				output = await handler(input as SessionInput);
			}
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		output = {
			systemMessage: `nxgt-crew: registry unavailable, nothing was checked (${message.slice(0, 200)}).`,
		};
	}
	if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
	process.exit(0);
}
