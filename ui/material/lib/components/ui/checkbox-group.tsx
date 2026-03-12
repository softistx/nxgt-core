'use client';

import { type ComponentProps, type ReactNode, useCallback } from 'react';

import { cn } from '../../lib/utils';
import { Checkbox } from './checkbox';
import { HelperText } from './helper-text';
import { Label } from './label';

export type CheckboxGroupProps = {
	options: { value: string; label: ReactNode }[];
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	disabled?: boolean;
	value?: string[];
	onValueChange?: (value: string[]) => void;
	orientation?: 'vertical' | 'horizontal';
} & ComponentProps<'div'>;

export function CheckboxGroup({
	options,
	label,
	helperText,
	error,
	value = [],
	className,
	disabled,
	onValueChange,
	orientation = 'horizontal',
	...props
}: CheckboxGroupProps) {
	const handleCheckedChange = useCallback(
		(selected: string) => (checked: boolean) => {
			if (checked) {
				if (!value.includes(selected)) {
					onValueChange?.([...value, selected]);
				}
			} else {
				onValueChange?.(value.filter((item) => item !== selected) ?? []);
			}
		},
		[onValueChange, value],
	);

	return (
		<div
			data-slot="checkbox-group"
			className={cn('flex flex-col gap-1 w-full', className)}
			{...props}
		>
			{label && <Label className="pl-0">{label}</Label>}
			{helperText && (
				<HelperText error={error} className="mb-2 pl-0">
					{helperText}
				</HelperText>
			)}
			<div
				data-slot="checkbox-group-options"
				data-orientation={orientation}
				className={cn(
					'flex items-center flex-wrap gap-2 data-[orientation=vertical]:items-start data-[orientation=vertical]:flex-col w-full',
				)}
			>
				{options.map((option, index) => (
					<Checkbox
						key={`item-${index.toString()}`}
						data-slot="checkbox-group-item"
						disabled={disabled}
						checked={value.includes(option.value)}
						id={option.value}
						label={option.label}
						onCheckedChange={handleCheckedChange(option.value)}
						className="min-w-min w-min"
					/>
				))}
			</div>
		</div>
	);
}
