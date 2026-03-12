import * as SwitchPrimitive from '@radix-ui/react-switch';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { inputDefaultClassNames } from './input';
import { Label } from './label';
import { Typography } from './typography';

export type SwitchProps = {
	label?: ReactNode;
	error?: boolean;
	helperText?: ReactNode;
	placeholder?: ReactNode;
} & ComponentProps<typeof SwitchPrimitive.Root>;

export function Switch({
	className,
	error,
	helperText,
	label,
	placeholder,
	...props
}: SwitchProps) {
	const component =
		!placeholder && !label ? (
			<Comp
				className={cn('cursor-pointer rounded-md h-min', className)}
				{...props}
			/>
		) : (
			<div
				aria-invalid={error}
				data-filed={!!props.value}
				className={cn(
					inputDefaultClassNames,
					{ 'border-error': error, 'bg-primary/10': props.value },
					className,
				)}
			>
				<Typography className={cn('flex-1 truncate text-primary')}>
					{placeholder || label}
				</Typography>
				<Comp
					aria-invalid={!error}
					className={cn('cursor-pointer rounded-md h-min', className)}
					{...props}
				/>
			</div>
		);
	if ((!label && !placeholder) || !placeholder) {
		return component;
	}

	return (
		<div data-slot="switch-field" className="grid w-full gap-1.5">
			{label && (
				<Label htmlFor={props.id} withAsterisk={props.required}>
					{label}
				</Label>
			)}
			{helperText ? (
				<div className="flex flex-col gap-0.5 h-full">
					{component}
					<HelperText error={error}>{helperText}</HelperText>
				</div>
			) : (
				component
			)}
		</div>
	);
}

function Comp({
	className,
	...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
				className,
			)}
			data-pw={props.name ?? 'switch'}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className={cn(
					'bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0',
				)}
				data-pw={props.name ? `${props.name}-thumb` : 'switch-thumb'}
			/>
		</SwitchPrimitive.Root>
	);
}
