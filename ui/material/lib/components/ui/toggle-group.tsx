'use client';

import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import type { VariantProps } from 'class-variance-authority';
import { type ComponentProps, createContext, useContext } from 'react';
import { cn } from '../../lib/utils';
import { Separator, type SeparatorProps } from './separator';
import { toggleVariants } from './toggle';

const ToggleGroupContext = createContext<VariantProps<typeof toggleVariants>>({
	size: 'default',
	variant: 'default',
});

function ToggleGroup({
	className,
	variant,
	size,
	children,
	...props
}: ComponentProps<typeof ToggleGroupPrimitive.Root> &
	VariantProps<typeof toggleVariants>) {
	return (
		<ToggleGroupPrimitive.Root
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			data-pw="toggle-group"
			className={cn(
				'group/toggle-group flex bg-muted w-fit items-center gap-1 p-2 rounded data-[variant=outline]:shadow-xs',
				className,
			)}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ variant, size }}>
				{children}
			</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive.Root>
	);
}

function ToggleGroupItem({
	className,
	children,
	variant,
	size,
	...props
}: ComponentProps<typeof ToggleGroupPrimitive.Item> &
	VariantProps<typeof toggleVariants>) {
	const context = useContext(ToggleGroupContext);

	return (
		<ToggleGroupPrimitive.Item
			data-slot="toggle-group-item"
			data-pw={
				props.value ? `toggle-group-item-${props.value}` : 'toggle-group-item'
			}
			data-variant={context.variant || variant}
			data-size={context.size || size}
			className={cn(
				toggleVariants({
					variant: context.variant || variant,
					size: context.size || size,
				}),
				'min-w-0 flex-1 shrink-0 shadow-none focus:z-10 focus-visible:z-10 data-[variant=outline]:border',
				className,
			)}
			{...props}
		>
			{children}
		</ToggleGroupPrimitive.Item>
	);
}

function ToggleGroupSeparator({
	className,
	...props
}: Omit<SeparatorProps, 'orientation'>) {
	return (
		<Separator
			data-slot="toggle-group-separator"
			className={cn('h-6! bg-muted-foreground/60 mx-1', className)}
			orientation="vertical"
			{...props}
		/>
	);
}

export { ToggleGroup, ToggleGroupItem, ToggleGroupSeparator };
