import { type Control, Controller, type Path } from 'react-hook-form';
import { LocationField, type LocationFieldProps } from '../location-field';

export function LocationFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	LocationFieldProps,
	'name' | 'value' | 'onChange'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<LocationField
					{...props}
					id={props.id ?? field.name}
					aria-invalid={fieldState.invalid}
					name={field.name}
					value={field.value}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
