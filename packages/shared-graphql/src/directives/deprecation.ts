import { logger } from '@nxgt/shared-logging';

/**
 * How a `@check` mistake that 2.x let boot is reported: a warning at build,
 * naming the field, that says it becomes a refusal in the next major.
 * `@permission` is new, so the same mistake there throws.
 */
export function warnCheckMistake(message: string) {
	logger.warn(
		`${message} — @check still boots with this; the next major refuses it, as @permission does`,
	);
}
