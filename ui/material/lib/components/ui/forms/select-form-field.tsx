import { type Control, Controller, type Path } from 'react-hook-form';
import { SelectField, type SelectFieldProps } from '../select-field';

export function SelectFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	SelectFieldProps,
	'name' | 'value'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<SelectField
					{...props}
					aria-invalid={fieldState.invalid}
					value={field.value ?? ''}
					disabled={field.disabled}
					onValueChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
