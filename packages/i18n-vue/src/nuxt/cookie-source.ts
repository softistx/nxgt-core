/** A year, in seconds: how long the cookie of a chosen locale lasts. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** The `useCookie` call of a generated plugin, for the cookie `name`. */
export const cookieSource = (name: string): string =>
	`useCookie(${JSON.stringify(name)}, { path: '/', sameSite: 'lax', maxAge: ${COOKIE_MAX_AGE} })`;
