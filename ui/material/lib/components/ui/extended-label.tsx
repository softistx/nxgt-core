import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { Typography, type TypographyProps } from './typography';

export type ExtendedLabelProps = {
	indicatorClassName?: string;
	trailing?: ReactNode;
} & TypographyProps;

export function ExtendedLabel({
	className,
	children,
	indicatorClassName,
	trailing,
	variant = 'title-medium',
	...props
}: ExtendedLabelProps) {
	return (
		<div
			className={cn(
				'flex justify-between items-end w-full mt-2 mb-1.5',
				className,
			)}
		>
			<Typography
				className={cn('grid gap-0.5 w-max font-semibold')}
				variant={variant}
				{...props}
			>
				{children}
				<div
					className={cn(
						'transition-all duration-500 h-1 starting:w-0 starting:bg-foreground w-14 bg-primary/95 rounded',
						indicatorClassName,
					)}
				></div>
			</Typography>
			{trailing && trailing}
		</div>
	);
}
