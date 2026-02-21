import i18next from 'i18next';
import { isNil, omit } from 'lodash';
import { DateTime } from 'luxon';
import type { ValidateOpts } from 'mongoose';
import type { DateFields, ValidatorOptions } from '../validation.types';
import { parseValidatorOptions } from '../validation.utils';

export function past(
	args: ValidatorOptions<
		Partial<Record<DateFields, number>> & { datetime?: boolean }
	>,
) {
	const options = parseValidatorOptions(args);

	const limit = DateTime.now().minus(omit(options.value, 'datetime'));

	return {
		message: options.message?.(
			{
				limit: limit
					.setLocale(i18next.language)
					.toLocaleString(
						(options.value.datetime ?? true)
							? DateTime.DATETIME_FULL
							: DateTime.DATE_FULL,
					),
			},
			'validation.errors.past',
		),
		validator(value) {
			return (
				isNil(value) ||
				(value instanceof Date &&
					DateTime.fromJSDate(value).isValid &&
					DateTime.fromJSDate(value) <= limit)
			);
		},
	} satisfies ValidateOpts<object, object, object>;
}
