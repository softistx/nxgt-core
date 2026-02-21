type PermissionSuffix =
	| 'create'
	| 'update'
	| 'delete'
	| 'find_one'
	| 'find_many';

export type PermissionKey<T extends string> = `${T}.${PermissionSuffix}`;
