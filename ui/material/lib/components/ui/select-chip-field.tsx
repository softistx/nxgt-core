import { type ComponentProps, type ReactNode, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { Chip } from './chip';
import { HelperText } from './helper-text';
import { Label } from './label';

export type SelectChipFieldProps = {
	mode?: 'single' | 'multiple';
	value: string[];
	onValueChange?: (value: string[]) => void;
	options: { value: string; label: string; icon?: ReactNode }[];
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	disabled?: boolean;
	name?: string;
} & Omit<ComponentProps<'div'>, 'children'>;

export function SelectChipField({
	value = [],
	onValueChange,
	mode = 'single',
	options,
	className,
	label,
	error,
	helperText,
	disabled,
	name,
	...props
}: SelectChipFieldProps) {
	const handleUpdate = useCallback(
		(target: string) => {
			if (mode === 'multiple') {
				if (value.includes(target)) {
					onValueChange?.(value.filter((item) => item !== target));
				} else {
					onValueChange?.([...value, target]);
				}
			} else {
				if (value.includes(target)) {
					onValueChange?.([]);
				} else {
					onValueChange?.([target]);
				}
			}
		},
		[mode, value, onValueChange],
	);
	return (
		<div
			data-slot="select-chip-field"
			className={cn('grid gap-1 w-full', className)}
			data-pw={name ?? 'select-chip-field'}
			{...props}
		>
			{label && <Label>{label}</Label>}
			{helperText && <HelperText error={error}>{helperText}</HelperText>}
			<div
				data-slot="select-chip-field-content"
				className={cn('flex flex-wrap gap-2')}
			>
				{options.map((option, index) => (
					<Chip
						key={`${option.value}-${index}`}
						leading={option.icon}
						label={option.label}
						onClick={(event) => {
							event.stopPropagation();
							handleUpdate(option.value);
						}}
						variant={value.includes(option.value) ? 'filled' : 'tonal'}
						className="px-4"
						disabled={disabled}
						aria-selected={value.includes(option.value)}
						data-pw={`${name ?? 'option'}-${index}`}
					/>
				))}
			</div>
		</div>
	);
}
