'use client';

import * as TogglePrimitive from '@radix-ui/react-toggle';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../lib/utils';

const toggleVariants = cva(
	"inline-flex center gap-2 rounded text-sm font-medium hover:bg-primary/20 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none transition-all aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error whitespace-nowrap",
	{
		variants: {
			variant: {
				default:
					'bg-transparent [[data-state=on]]:bg-primary/90 [[data-state=on]]:text-primary-foreground',
				outlined:
					'border border-primary/60 [[data-state=on]]:bg-primary/60 [[data-state=on]]:text-primary-foreground bg-transparent shadow-xs hover:bg-primary/30 hover:text-foreground/40',
			},
			size: {
				default: 'h-9 px-2 min-w-9',
				sm: 'h-8 px-1.5 min-w-8',
				lg: 'h-10 px-2.5 min-w-10',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

function Toggle({
	className,
	variant,
	size,
	...props
}: ComponentProps<typeof TogglePrimitive.Root> &
	VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive.Root
			data-slot="toggle"
			data-pw={props.name ?? 'toggle'}
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };
