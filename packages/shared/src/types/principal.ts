/**
 * The caller as an access token describes them.
 *
 * Distinct from `Principal` in `../models/user.ts`, which is the caller as the
 * gateway's `X-User-*` headers describe them — a different set of fields from a
 * different source. nxgt-federation called this one `Principal` too; it is
 * renamed here because both shapes now live in one package, and picking a
 * winner would have silently changed what one repository's code means.
 */
export interface User {
	// Base fields (merged)
	id: string;
	createdBy?: string;
	createdDate?: string;
	lastModifiedBy?: string;
	lastModifiedDate?: string;
	version: number;

	// User fields
	firstName?: string;
	lastName?: string;
	bio?: string;

	username: string;
	preferredUsername?: string;

	email: string;
	emailVerified?: boolean;

	phoneNumber?: string;
	phoneNumberVerified?: boolean;

	avatar?: string;
	website?: string;

	locale?: string;
	zoneinfo?: string;
	birthdate?: string;

	address?: {
		streetAddress?: string;
		locality?: string;
		region?: string;
		postalCode?: string;
		country?: string;
	};

	attributes?: Record<string, any>;

	roles: string[];
}

export type TokenPrincipal = {
	name?: string;
	sub?: string;
	username?: string;
	clientId?: string;
	scope?: string;
	tokenType?: string;
	token?: string;

	exp?: number;
	iat?: number;
	nbf?: number;

	iss?: string;

	uid?: string;

	authorities?: string[];
	roles?: string[];
	permissions?: string[];

	user?: User;
};
