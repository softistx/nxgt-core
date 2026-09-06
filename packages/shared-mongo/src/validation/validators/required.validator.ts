import { isEmpty, isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function required(args: ValidatorOptions<true>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({}, 'validation.errors.required'),
		validator(value) {
			return typeof value === 'number'
				? !isNil(value)
				: !isNil(value) && !isEmpty(value);
		},
	} satisfies ValidateOpts<object, object>;
}
