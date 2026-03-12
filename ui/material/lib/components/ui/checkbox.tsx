import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { type ComponentProps, type ReactNode, useId } from 'react';

import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';

export type CheckboxProps = {
	label?: ReactNode;
	helperText?: ReactNode;
} & ComponentProps<typeof CheckboxPrimitive.Root>;

export function Checkbox({
	label,
	helperText,
	className,
	...props
}: CheckboxProps) {
	const id = useId();

	return label || helperText ? (
		<div
			data-slot="checkbox-field"
			className={cn('flex gap-1.5 w-full min-w-[280px]', className)}
		>
			<Comp {...props} id={props.id ?? id} />
			<div className="flex flex-col gap-0.5">
				<Label htmlFor={props.id ?? id} className="mt-px pl-0.5 mt-0.5">
					{label}
				</Label>
				{helperText && <HelperText>{helperText}</HelperText>}
			</div>
		</div>
	) : (
		<Comp
			data-slot="checkbox-field"
			className={className}
			{...props}
			id={props.id ?? id}
		/>
	);
}

function Comp({
	className,
	...props
}: ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				'peer p-2 grid place-content-center border-muted-foreground dark:bg-input/30 data-[state=checked]:text-primary-foreground data-[state=checked]:border-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error size-4 shrink-0 rounded-xs border-[0.13em] shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
				'data-[state=indeterminate]:text-primary-foreground dark:data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary',
				'in-[[data-state=selected]]:**:data-[slot=indicator]:bg-primary-foreground in-[[data-state=selected]]:border-primary-foreground!',
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="flex center text-current"
			>
				<div
					data-slot="indicator"
					className={cn(
						'bg-primary transition-all duration-150 ease-in-out size-2.5',
						{
							'scale-0': !props.checked,
							'h-0.5': props.checked === 'indeterminate',
						},
					)}
				/>
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}
