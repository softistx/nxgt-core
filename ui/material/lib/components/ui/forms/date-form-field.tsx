import { type Control, Controller, type Path } from 'react-hook-form';
import { DateField, type DateFieldProps } from '../date-field';

export function DateFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<DateFieldProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<DateField
					{...props}
					id={props.id ?? field.name}
					aria-invalid={fieldState.invalid}
					value={field.value}
					disabled={field.disabled}
					onDayBlur={field.onBlur}
					onValueChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
