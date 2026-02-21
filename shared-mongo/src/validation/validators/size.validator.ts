import { isArray, isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function size(args: ValidatorOptions<[number, number]>) {
	const options = parseValidatorOptions(args);

	if (options.value[0] > options.value[1]) {
		throw new Error(
			'First argument  must ne less than or equal to the second argument',
		);
	}

	return {
		message: options.message?.(
			{ min: options.value[0], max: options.value[1] },
			'validation.errors.size',
		),
		validator(value) {
			return (
				isNil(value) ||
				((typeof value === 'string' || isArray(value)) &&
					value.length >= options.value[0] &&
					value.length <= options.value[1])
			);
		},
	} satisfies ValidateOpts<object, object>;
}
