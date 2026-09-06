import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function min(args: ValidatorOptions<number>) {
	const options = parseValidatorOptions(args);

	return {
		message: options.message?.({ min: options.value }, 'validation.errors.min'),
		validator(value) {
			return (
				isNil(value) || (typeof value === 'number' && value >= options.value)
			);
		},
	} satisfies ValidateOpts<object, object>;
}
