import { isArray } from 'lodash';
import { File } from 'lucide-react';
import { type Control, Controller, type Path } from 'react-hook-form';
import {
	Autocomplete,
	type AutocompleteOption,
	type AutocompleteProps,
} from '../autocomplete';

type FilesFormFieldProps<
	T extends Record<string, any>,
	U extends AutocompleteOption,
> = { control: Control<T>; name: Path<T>; image?: boolean } & Omit<
	AutocompleteProps<U>,
	'name' | 'value'
>;

export function FilesFormField<
	T extends Record<string, any>,
	U extends AutocompleteOption,
>({ control, name, ...props }: FilesFormFieldProps<T, U>) {
	return (
		<Controller
			control={control}
			name={name}
			render={({ field, fieldState }) => (
				<Autocomplete
					{...props}
					id={props.id ?? field.name}
					data-slot="files-form-field"
					aria-invalid={fieldState.invalid}
					name={field.name}
					value={
						(props.mode === 'multiple'
							? isArray(field.value)
								? field.value
								: []
							: field.value) as any
					}
					renderSelectedLeading={(option) => {
						if (props.image && option.value) {
							return (
								<img
									src={option.value}
									alt={option.label}
									className="size-8 ronded object-cover"
								/>
							);
						}
						return <File className="size-4 text-muted-foreground" />;
					}}
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
