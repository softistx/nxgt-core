import { isArray } from 'lodash';
import { type Control, Controller, type Path } from 'react-hook-form';
import { Slider, type SliderProps } from '../slider';

export function SliderFormField<T extends Record<string, any>>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<SliderProps, 'name'>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Slider
					{...props}
					aria-invalid={fieldState.invalid}
					value={field.value}
					disabled={field.disabled}
					onBlur={field.onBlur}
					onValueChange={(value) => {
						field.onChange(isArray(field.value) ? value : value?.[0]);
					}}
					error={fieldState.invalid}
					helperText={fieldState.error?.message}
				/>
			)}
		/>
	);
}
