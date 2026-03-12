import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function ResponsiveGrid({
	className,
	children,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			{...props}
			data-slot="responsive-grid"
			className={cn('w-full grid @container', className)}
		>
			<div
				className={cn(
					'grid @lg:grid-cols-2 @2xl:grid-cols-3  @4xl:grid-cols-4 @6xl:grid-cols-5 gap-2',
				)}
			>
				{children}
			</div>
		</div>
	);
}
