export const AUDIT_OMIT_FIELDS = ['__v', 'createdDate', 'lastModifiedDate'];

export const EVENTS = {
	created: (name: string) => `${name}-created`.toLowerCase(),
	updated: (name: string) => `${name}-updated`.toLowerCase(),
	deleted: (name: string) => `${name}-deleted`.toLowerCase(),
};
