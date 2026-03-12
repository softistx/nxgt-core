import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../lib/utils';

export const typographyVariants = cva(
	'overflow-auto in-[[data-state=selected]]:text-primary-foreground',
	{
		variants: {
			variant: {
				normal: 'text-sm',
				'huge-larger': 'text-8xl font-semibold',
				'huge-large': 'text-8xl font-semibold',
				'huge-medium': 'text-7xl font-semibold',
				'huge-small': 'text-6xl font-semibold',
				'headline-larger': 'text-5xl font-semibold',
				'headline-large': 'text-4xl font-semibold',
				'headline-medium': 'text-3xl font-semibold',
				'headline-small': 'text-2xl font-semibold',
				'title-large': 'text-xl font-semibold',
				'title-medium': 'text-lg font-semibold',
				'title-small': 'text-base font-semibold',
				'body-medium': 'text-sm',
				'body-small': 'text-xs',
				caption: 'text-[10px] text-muted-foreground',
			},
		},

		defaultVariants: {
			variant: 'normal',
		},
	},
);

export type TypographyProps = ComponentProps<'p'> &
	VariantProps<typeof typographyVariants>;

export function Typography({ className, variant, ...props }: TypographyProps) {
	return (
		<div
			data-test="typogaphy"
			className={cn(typographyVariants({ variant, className }))}
			{...props}
		/>
	);
}
