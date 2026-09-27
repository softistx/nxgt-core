/** Durations and timestamps, shared by the registry and the text it renders. */

export const minutes = (n: number) => n * 60_000;

/** The later of two ISO timestamps; either may be absent. */
export function latest(
	a: string | undefined,
	b: string | undefined,
): string | undefined {
	if (a === undefined) return b;
	if (b === undefined) return a;
	return Date.parse(a) >= Date.parse(b) ? a : b;
}

/** "just now", "12 min ago", "3 h ago". */
export function ago(iso: string, now: Date): string {
	const m = Math.round((now.getTime() - Date.parse(iso)) / 60_000);
	if (m < 1) return 'just now';
	if (m < 120) return `${m} min ago`;
	return `${Math.round(m / 60)} h ago`;
}
