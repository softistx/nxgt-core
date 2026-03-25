import z from 'zod';

export const PrincipalSchema = z.object({
	id: z.string().nullish(),
	name: z.string().optional(),
	username: z.string().nullish(),
	email: z.email().nullish(),
	authorities: z.array(z.string()).nullish(),
	birthDate: z.coerce.date().nullish(),
	firstName: z.string().nullish(),
	lastName: z.string().nullish(),
	clientId: z.string().nullish(),
	scopes: z.array(z.string()).nullish(),
	roles: z.array(z.string()).nullish(),
});

export type Principal = z.infer<typeof PrincipalSchema>;

export const USER_HEADERS = {
	ID: 'X-User-Id',
	USERNAME: 'X-User-Name',
	EMAIL: 'X-User-Email',
	NAME: 'X-Name',
	FIRST_NAME: 'X-User-Firstname',
	LAST_NAME: 'X-User-Lastname',
	BIRTH_DATE: 'X-User-Birthdate',
	AUTHORITIES: 'X-User-Authorities',
	ROLES: 'X-Roles',
	SCOPES: 'X-Scopes',
	CLIENT: 'X-Client-Id',
} as const;
