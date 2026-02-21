import { REGEX } from '@nxgt/shared/helpers';
import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function email(args: ValidatorOptions<{ domains?: string[] }>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.(
			{
				domains: options.value.domains?.join(', '),
				numberOfDomains: options.value.domains?.length ?? 0,
			},
			'validation.errors.email',
		),
		validator(value) {
			return (
				isNil(value) ||
				(typeof value === 'string' &&
					REGEX.email.test(value) &&
					(options.value.domains?.length
						? options.value.domains.filter((domain) => value.includes(domain))
								.length === options.value.domains.length
						: true))
			);
		},
	} satisfies ValidateOpts<object, object>;
}
