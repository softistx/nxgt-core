import { type ReactNode, useCallback } from 'react';
import {
	SelectCardField,
	type SelectCardFieldOption,
	type SelectCardFieldProps,
} from './select-card-field';

export type CheckCardFieldOption = Omit<SelectCardFieldOption, 'value'>;

export type CheckCardFieldProps = {
	value: boolean;
	onValueChange?: (value: boolean) => void;
	options: [CheckCardFieldOption, CheckCardFieldOption];
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	disabled?: boolean;
} & Omit<SelectCardFieldProps, 'value' | 'onValueChange' | 'options' | 'mode'>;

export function CheckCardField({
	value,
	onValueChange,
	options,
	...props
}: CheckCardFieldProps) {
	const handleChange = useCallback(
		(value: string[]) => {
			onValueChange?.(!!value.includes('positive'));
		},
		[onValueChange],
	);
	return (
		<SelectCardField
			value={value ? ['positive'] : ['negative']}
			onValueChange={handleChange}
			options={[
				{ value: 'positive', ...options[0] },
				{ value: 'negative', ...options[1] },
			]}
			mode="single"
			{...props}
		/>
	);
}
