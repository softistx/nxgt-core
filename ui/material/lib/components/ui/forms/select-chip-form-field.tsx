import { type Control, Controller, type Path } from 'react-hook-form';
import {
	SelectChipField,
	type SelectChipFieldProps,
} from '../select-chip-field';

export function SelectChipFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	SelectChipFieldProps,
	'name' | 'value'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<SelectChipField
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
