import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from './select';

export type SelectOption = { value: string; label: string };

export type SelectFieldProps = {
	value: string;
	placeholder?: ReactNode;
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	options: SelectOption[];
	className?: string;
	renderOption?: (option: SelectOption) => ReactNode;
} & ComponentProps<typeof Select>;

export function SelectField({
	value,
	error,
	helperText,
	label,
	options,
	placeholder,
	className,
	renderOption,
	...props
}: SelectFieldProps) {
	return (
		<Select value={value} {...props}>
			<SelectFieldTrigger
				name={props.name}
				value={value}
				error={error}
				label={label}
				helperText={helperText}
				className={className}
			/>
			<SelectContent className="flex rounded shadow">
				{options.map((option, index) => (
					<SelectItem
						key={`item-${index.toString()}`}
						value={option.value}
						className={cn('border-l-2 border-transparent', {
							'rounded-l-none border-primary/60 bg-primary/5':
								value === option.value,
						})}
						asChild={!!renderOption}
						aria-selected={value === option.value}
						data-pw={`${props.name ?? 'option'}-${index}`}
					>
						{renderOption ? renderOption(option) : option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function SelectFieldTrigger({
	value,
	error,
	helperText,
	label,
	placeholder,
	required,
	className,
	name,
}: Pick<
	SelectFieldProps,
	| 'error'
	| 'helperText'
	| 'label'
	| 'placeholder'
	| 'value'
	| 'required'
	| 'name'
> & { className?: string }) {
	return (
		<div
			data-slot="select-field"
			className={cn('grid w-full gap-1.5', className)}
		>
			<Label withAsterisk={required}>{label}</Label>
			{helperText ? (
				<div className="flex flex-col gap-0.5">
					<SelectTrigger
						aria-invalid={error}
						className={cn('rounded pr-2.5', {
							'bg-primary/10': !!value.length,
						})}
						name={name}
					>
						<SelectValue placeholder={placeholder || label} />
					</SelectTrigger>
					<HelperText error={error}>{helperText}</HelperText>
				</div>
			) : (
				<SelectTrigger
					className={cn('rounded pr-2.5', { 'bg-primary/10': !!value.length })}
					aria-invalid={error}
					name={name}
				>
					<SelectValue placeholder={placeholder || label} />
				</SelectTrigger>
			)}
		</div>
	);
}
