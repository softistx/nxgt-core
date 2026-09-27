/**
 * The knobs, read from the environment once per hook, and the caps that keep
 * a record small.
 */

export interface Settings {
	/** A session silent this long, with no live process to vouch for it, is stale. */
	readonly staleMinutes: number;
	/** An edit older than this no longer holds its file. */
	readonly editWindowMinutes: number;
	/** A silent session whose process is alive still counts, up to this long. */
	readonly idleHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
	staleMinutes: 30,
	editWindowMinutes: 60,
	idleHours: 12,
};

export const LIMITS = {
	edits: 50,
	claims: 20,
	announcements: 20,
	/** Plans have their own budget, on top of `announcements`. */
	plans: 10,
	/** Of `announcements`, the latest releases always kept. */
	releases: 5,
	announcementLength: 280,
} as const;

export function readSettings(
	env: Record<string, string | undefined>,
): Settings {
	const num = (key: string, fallback: number) => {
		const raw = env[key];
		if (raw === undefined || raw === '') return fallback;
		const n = Number(raw);
		return Number.isFinite(n) && n > 0 ? n : fallback;
	};
	return {
		staleMinutes: num('NXGT_CREW_STALE_MINUTES', DEFAULT_SETTINGS.staleMinutes),
		editWindowMinutes: num(
			'NXGT_CREW_EDIT_WINDOW_MINUTES',
			DEFAULT_SETTINGS.editWindowMinutes,
		),
		idleHours: num('NXGT_CREW_IDLE_HOURS', DEFAULT_SETTINGS.idleHours),
	};
}
