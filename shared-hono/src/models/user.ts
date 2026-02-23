import z from 'zod';

export const PrincipalSchema = z.object({
	id: z.string(),
	username: z.string(),
	email: z.email(),
	authorities: z.array(z.string()),
	birthDate: z.coerce.date().nullish(),
	firstName: z.string().nullish(),
	lastName: z.string().nullish(),
});

export type Principal = z.infer<typeof PrincipalSchema>;

export const USER_HEADERS = {
	ID: 'X-User-Id',
	USERNAME: 'X-User-Name',
	EMAIL: 'X-User-Email',
	FIRST_NAME: 'X-User-Firstname',
	LAST_NAME: 'X-User-Lastname',
	BIRTH_DATE: 'X-User-Birthdate',
	AUTHORITIES: 'X-User-Authorities',
};
