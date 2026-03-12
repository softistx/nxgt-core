import { isArray } from 'lodash';
import { type Control, Controller, type Path } from 'react-hook-form';
import {
	Autocomplete,
	type AutocompleteOption,
	type AutocompleteProps,
} from '../autocomplete';

export function AutocompleteFormField<
	T extends Record<string, any>,
	U extends AutocompleteOption,
>({
	control,
	name,
	...props
}: { control: Control<T>; name: Path<T> } & Omit<
	AutocompleteProps<U>,
	'name' | 'value'
>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Autocomplete
					{...props}
					id={props.id ?? field.name}
					aria-invalid={fieldState.invalid}
					name={field.name}
					value={
						(props.mode === 'multiple'
							? isArray(field.value)
								? field.value
								: []
							: field.value) as any
					}
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
