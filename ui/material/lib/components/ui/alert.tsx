import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Typography } from './typography';

const variants = cva(
	"transition-all border-l-8 p-4 gap-2 [&_svg:not([class*='size-'])]:size-4 [&_svg]:mt-1 shadow-xs",
	{
		variants: {
			variant: {
				primary:
					'border-primary bg-primary/5 [&_svg]:text-primary shadow-primary/50',
				secondary:
					'border-secondary bg-secondary/5 [&_svg]:text-secondary shadow-secondary/50',
				error: 'border-error bg-error/5 [&_svg]:text-error shadow-error',
				success:
					'border-success bg-success/5 [&_svg]:text-success shadow-success/50',
				info: 'border-info bg-info/5 [&_svg]:text-info shadow-info/50',
				warning:
					'border-warning bg-warning/5 [&_svg]:text-warning shadow-warning/50',
				foreground:
					'border-foreground bg-muted [&_svg]:text-foreground shadow-foreground/50',
			},
		},
		defaultVariants: {
			variant: 'primary',
		},
	},
);

export type AlertProps = {
	icon?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
} & Omit<ComponentProps<'div'>, 'title' | 'description'> &
	VariantProps<typeof variants>;

export function Alert({
	description,
	icon,
	title,
	className,
	variant,
	...props
}: AlertProps) {
	return (
		<div className={cn('flex', variants({ variant, className }))} {...props}>
			{icon && icon}
			<div className="flex flex-col gap-1 flex-1">
				{title && (
					<Typography variant={'title-small'} className="font-bold">
						{title}
					</Typography>
				)}
				{description && (
					<Typography className="text-muted-foreground">
						{description}
					</Typography>
				)}
			</div>
		</div>
	);
}
