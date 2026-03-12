import { type Control, Controller, type Path } from 'react-hook-form';
import {
	SelectCardField,
	type SelectCardFieldProps,
} from '../select-card-field';

export function SelectCardFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	SelectCardFieldProps,
	'name' | 'value'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<SelectCardField
					{...props}
					aria-invalid={fieldState.invalid}
					value={field.value}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onValueChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
