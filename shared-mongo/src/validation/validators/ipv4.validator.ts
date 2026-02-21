import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import { REGEX } from '../../../helpers';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function ipv4(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.ipv4'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'string' && REGEX.ipv4.test(value))
			);
		},
	} satisfies ValidateOpts<object, object, object>;
}
