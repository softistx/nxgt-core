export type MessageType = string;

export type DateFields =
	| 'year'
	| 'month'
	| 'week'
	| 'day'
	| 'hour'
	| 'minute'
	| 'second'
	| 'millisecond';

export type ValidatorOptions<T> = T | [T, MessageType];

export interface IConstraintValidation {
	minLength?: ValidatorOptions<number>;
	maxLength?: ValidatorOptions<number>;
	min?: ValidatorOptions<number>;
	max?: ValidatorOptions<number>;
	size?: ValidatorOptions<number>;
	range?: ValidatorOptions<number>;
	past?: ValidatorOptions<DateFields>;
	future?: ValidatorOptions<DateFields>;
	email?: ValidatorOptions<{ domains?: string[] }>;
	url?: ValidatorOptions<{ domains?: string[] }>;
	ip?: ValidatorOptions<{ startsWith?: string[]; endsWidth?: string[] }>;
	positive?: ValidatorOptions<true>;
	negative?: ValidatorOptions<true>;
	mac?: ValidatorOptions<true>;
	ipv4?: ValidatorOptions<true>;
	ipv6?: ValidatorOptions<true>;
	ssn?: ValidatorOptions<true>;
	uuid?: ValidatorOptions<true>;
	guid?: ValidatorOptions<true>;
	zipCode?: ValidatorOptions<true>;
	street?: ValidatorOptions<true>;
	phone?: ValidatorOptions<true>;
	objectId?: ValidatorOptions<true>;
}
