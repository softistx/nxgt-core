import { isNil } from 'lodash';
import type { ValidateOpts } from 'mongoose';
import type { ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function range(args: ValidatorOptions<[number, number]>) {
	const options = parseValidatorOptions(args);

	if (options.value[0] > options.value[1]) {
		throw new Error(
			'First argument  must ne less than or equal to the second argument',
		);
	}

	return {
		message: options.message?.(
			{ min: options.value[0], max: options.value[1] },
			'validation.errors.range',
		),
		validator(value) {
			return (
				isNil(value) ||
				(typeof value === 'number' &&
					value >= options.value[0] &&
					value <= options.value[1])
			);
		},
	} satisfies ValidateOpts<object, object>;
}
