import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';

export type RadioGroupProps = {
	options: { value: string; label: ReactNode }[];
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	orientation?: 'vertical' | 'horizontal';
} & ComponentProps<typeof RadioGroupPrimitive.Root>;

function RadioGroup({
	options,
	label,
	helperText,
	error,
	orientation = 'horizontal',
	className,
	...props
}: RadioGroupProps) {
	return (
		<div className={cn('flex flex-col gap-2, w-full', className)}>
			{label && <Label className="pl-0">{label}</Label>}
			{helperText && (
				<HelperText error={error} className="mb-2 pl-0">
					{helperText}
				</HelperText>
			)}
			<RadioGroupBase {...props}>
				<div
					data-slot="radio-group-options"
					data-orientation={orientation}
					className="flex items-center flex-wrap gap-2 data-[orientation=vertical]:items-start data-[orientation=vertical]:flex-col"
				>
					{options.map((option, index) => (
						<div
							key={`item-${index.toString()}`}
							className="flex items-center gap-2"
						>
							<RadioGroupItem
								data-pw={`${props.name ?? 'option'}-${index}`}
								value={option.value}
								id={option.value}
							/>
							<Label className="pl-0" htmlFor={option.value}>
								{option.label}
							</Label>
						</div>
					))}
				</div>
			</RadioGroupBase>
		</div>
	);
}

function RadioGroupBase({
	className,
	...props
}: ComponentProps<typeof RadioGroupPrimitive.Root>) {
	return (
		<RadioGroupPrimitive.Root
			data-slot="radio-group"
			data-pw={props.name ?? 'radio-group'}
			className={cn('grid gap-3', className)}
			{...props}
		/>
	);
}

function RadioGroupItem({
	className,
	...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
	return (
		<RadioGroupPrimitive.Item
			data-slot="radio-group-item"
			className={cn(
				'border-input data-[state=checked]:border-4 data-[state=checked]:border-primary text-primary focus-visible:border-primary focus-visible:ring-primary/50 aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			{...props}
		>
			<RadioGroupPrimitive.Indicator
				data-slot="radio-group-indicator"
				className="relative flex center"
			></RadioGroupPrimitive.Indicator>
		</RadioGroupPrimitive.Item>
	);
}

export { RadioGroup, RadioGroupBase, RadioGroupItem };
