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
 * Pending means launched in the background with no notification yet.
 *
 * It also lists the files the session edited — the `file_path` of its Edit,
 * Write and MultiEdit calls and the `notebook_path` of NotebookEdit — so the
 * hook checks a worktree edited by absolute path while the cwd stays the main
 * checkout. Lines of a sidechain (a subagent's own turns) are ignored. Pure:
 * the text is passed in.
 *
 * A pending auditor silences the gate for every package, and a notification
 * that never lands keeps the session silent — accepted: the gate fails silent.
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

/** The tools whose input names a file the session wrote. */
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const EDIT_MARKERS = [...EDIT_TOOLS].map((name) => `"${name}"`);

function editedPath(block: Json): string | undefined {
	if (block['type'] !== 'tool_use') return undefined;
	const name = block['name'];
	if (typeof name !== 'string' || !EDIT_TOOLS.has(name)) return undefined;
	const input = block['input'];
	if (!input || typeof input !== 'object') return undefined;
	const path = (input as Json)['file_path'] ?? (input as Json)['notebook_path'];
	return typeof path === 'string' && path ? path : undefined;
}

export interface TranscriptFacts {
	/** A documentation-auditor run launched in the background and not yet notified. */
	readonly auditorPending: boolean;
	/**
	 * The `file_path` (or `notebook_path`) of every Edit, Write, MultiEdit and
	 * NotebookEdit call of the session itself, latest first, without repeats.
	 */
	readonly editedPaths: readonly string[];
}

/**
 * Reads the facts the Stop hook needs in one pass over the transcript. Only
 * lines that may matter are parsed: a quick substring check skips the rest.
 */
export function readTranscript(transcript: string): TranscriptFacts {
	const launches = new Set<string>();
	const background = new Set<string>();
	const notified = new Set<string>();
	const edited: string[] = [];
	for (const line of transcript.split('\n')) {
		const toolUse = line.includes('"tool_use"');
		const launch = toolUse && line.includes(AUDITOR);
		const edit = toolUse && EDIT_MARKERS.some((m) => line.includes(m));
		const asyncResult = line.includes('"tool_result"') && line.includes('sync');
		const notice =
			line.includes('task-notification') && line.includes('<tool-use-id>');
		if (!launch && !edit && !asyncResult && !notice) continue;
		const entry = parse(line);
		if (!entry || entry['isSidechain'] === true) continue;
		for (const block of blocks(entry)) {
			if (launch && isAuditorLaunch(block) && typeof block['id'] === 'string')
				launches.add(block['id']);
			const path = edit ? editedPath(block) : undefined;
			if (path) edited.push(path);
			const id = block['tool_use_id'];
			if (
				asyncResult &&
				block['type'] === 'tool_result' &&
				typeof id === 'string' &&
				isAsyncResult(entry, block)
			)
				background.add(id);
		}
		if (notice) {
			for (const match of line.matchAll(/<tool-use-id>([^<]+)<\/tool-use-id>/g))
				if (match[1]) notified.add(match[1]);
		}
	}
	return {
		auditorPending: [...background].some(
			(id) => launches.has(id) && !notified.has(id),
		),
		editedPaths: [...new Set(edited.reverse())],
	};
}

export function auditorPending(transcript: string): boolean {
	return readTranscript(transcript).auditorPending;
}

export function editedPaths(transcript: string): readonly string[] {
	return readTranscript(transcript).editedPaths;
}
