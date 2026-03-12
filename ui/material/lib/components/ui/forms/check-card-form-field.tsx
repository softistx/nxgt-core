import { type Control, Controller, type Path } from 'react-hook-form';
import { CheckCardField, type CheckCardFieldProps } from '../check-card-field';

export function CheckCardFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	CheckCardFieldProps,
	'name' | 'value'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<CheckCardField
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
