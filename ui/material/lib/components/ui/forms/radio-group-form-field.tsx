import { type Control, Controller, type Path } from 'react-hook-form';
import { RadioGroup, type RadioGroupProps } from '../radio-group';

export function RadioGroupFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<RadioGroupProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<RadioGroup
					{...props}
					id={props.id ?? name}
					aria-invalid={fieldState.invalid}
					value={field.value}
					onBlur={field.onBlur}
					disabled={field.disabled}
					onValueChange={field.onChange}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
