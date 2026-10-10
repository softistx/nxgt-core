/**
 * Whether a `documentation-auditor` run is still pending in a session, read
 * from its JSONL transcript. The shapes Claude Code writes:
 *
 * - the launch: an assistant line whose content holds a `tool_use` named
 *   `Agent` (or `Task`) with `input.subagent_type` ending in
 *   `documentation-auditor`;
 * - its result: a user line whose content holds the `tool_result` for that
 *   id. In the foreground it is the report, so the run is over; in the
 *   background the line's `toolUseResult` says `isAsync: true` /
 *   `status: "async_launched"` (and the text starts "Async agent launched");
 * - a background completion: a `<task-notification>` naming
 *   `<tool-use-id>ID</tool-use-id>`, on a `queue-operation` line and again on
 *   the user line that delivers it.
 *
 * Pending means launched in the background with no notification yet. Lines of
 * a sidechain (a subagent's own turns) are ignored. Pure: the text is passed in.
 */

const AUDITOR = 'documentation-auditor';

type Json = Record<string, unknown>;

function parse(line: string): Json | undefined {
	try {
		const value: unknown = JSON.parse(line);
		return value && typeof value === 'object' ? (value as Json) : undefined;
	} catch {
		return undefined;
	}
}

function blocks(entry: Json): Json[] {
	const message = entry['message'];
	if (!message || typeof message !== 'object') return [];
	const content = (message as Json)['content'];
	return Array.isArray(content)
		? content.filter((b): b is Json => !!b && typeof b === 'object')
		: [];
}

function isAuditorLaunch(block: Json): boolean {
	if (block['type'] !== 'tool_use') return false;
	const input = block['input'];
	if (!input || typeof input !== 'object') return false;
	const type = (input as Json)['subagent_type'];
	return typeof type === 'string' && type.endsWith(AUDITOR);
}

function isAsyncResult(entry: Json, block: Json): boolean {
	const result = entry['toolUseResult'];
	if (result && typeof result === 'object') {
		const r = result as Json;
		if (r['isAsync'] === true || r['status'] === 'async_launched') return true;
	}
	const content = block['content'];
	const text =
		typeof content === 'string'
			? content
			: Array.isArray(content)
				? content
						.map((c) => (c && typeof c === 'object' ? (c as Json)['text'] : ''))
						.join('')
				: '';
	return typeof text === 'string' && text.startsWith('Async agent launched');
}

export function auditorPending(transcript: string): boolean {
	const lines = transcript.split('\n');
	const launches = new Set<string>();
	for (const line of lines) {
		if (!line.includes(AUDITOR) || !line.includes('"tool_use"')) continue;
		const entry = parse(line);
		if (!entry || entry['isSidechain'] === true) continue;
		for (const block of blocks(entry)) {
			if (isAuditorLaunch(block) && typeof block['id'] === 'string') {
				launches.add(block['id']);
			}
		}
	}
	if (launches.size === 0) return false;

	const background = new Set<string>();
	const finished = new Set<string>();
	for (const line of lines) {
		const ids = [...launches].filter((id) => line.includes(id));
		if (ids.length === 0) continue;
		const entry = parse(line);
		if (!entry || entry['isSidechain'] === true) continue;
		for (const block of blocks(entry)) {
			const id = block['tool_use_id'];
			if (block['type'] !== 'tool_result' || typeof id !== 'string') continue;
			if (!launches.has(id)) continue;
			if (isAsyncResult(entry, block)) background.add(id);
			else finished.add(id);
		}
		if (line.includes('task-notification')) {
			for (const id of ids) {
				if (line.includes(`<tool-use-id>${id}</tool-use-id>`)) finished.add(id);
			}
		}
	}
	return [...background].some((id) => !finished.has(id));
}
