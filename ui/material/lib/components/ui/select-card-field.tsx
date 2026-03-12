import { type ComponentProps, type ReactNode, useCallback } from 'react';
import { cn } from '../../lib/utils';
import { ActionCard } from './action-card';
import { HelperText } from './helper-text';
import { Label } from './label';

export type SelectCardFieldOption = {
	value: string;
	title: string;
	description?: string;
	icon?: ReactNode;
};

export type SelectCardFieldProps = {
	mode?: 'single' | 'multiple';
	value: string[];
	onValueChange?: (value: string[]) => void;
	options: SelectCardFieldOption[];
	label?: ReactNode;
	helperText?: ReactNode;
	actionCardClassName?: string;
	error?: boolean;
	disabled?: boolean;
	name?: string;
} & Omit<ComponentProps<'div'>, 'children'>;

export function SelectCardField({
	value = [],
	onValueChange,
	mode = 'single',
	options,
	className,
	actionCardClassName,
	label,
	error,
	helperText,
	disabled,
	name,
	...props
}: SelectCardFieldProps) {
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
			data-slot="select-card-field"
			className={cn('grid gap-1', className)}
			data-pw={name ?? 'select-card-field'}
			{...props}
		>
			{label && <Label>{label}</Label>}
			{helperText && <HelperText error={error}>{helperText}</HelperText>}
			<div
				data-slot="select-card-field-content"
				className={cn('flex flex-wrap gap-2')}
			>
				{options.map((option, index) => (
					<ActionCard
						key={`${option.value}-${index}`}
						icon={option.icon}
						title={option.title}
						description={option.description}
						onClick={(event) => {
							event.stopPropagation();
							handleUpdate(option.value);
						}}
						active={value.includes(option.value)}
						className={cn('px-4', actionCardClassName)}
						aria-disabled={disabled}
						aria-selected={value.includes(option.value)}
						data-pw={`${name ?? 'option'}-${index}`}
					/>
				))}
			</div>
		</div>
	);
}
