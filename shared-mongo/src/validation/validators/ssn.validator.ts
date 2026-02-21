import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import { REGEX } from '../../../helpers';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function ssn(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.ssn'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'string' && REGEX.ssn.test(value))
			);
		},
	} satisfies ValidateOpts<object, object, object>;
}
