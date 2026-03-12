import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export function Background({
	children,
	className,
	...props
}: ComponentProps<'div'>) {
	return (
		<div
			data-slot={'background'}
			className={cn(
				'flex flex-col size-lv relative bg-gradient-to-r from-primary/5 to-primary/20',
				className,
			)}
			{...props}
		>
			<div
				className={
					'absolute w-32 bottom-1/3 aspect-square bg-gradient-to-r from-primary to-secondary rounded-full blur-3xl'
				}
			></div>
			<div
				className={
					'absolute bottom-0 right-0 w-32 max-w-md aspect-square bg-gradient-to-r from-primary to-secondary rounded-full blur-3xl '
				}
			></div>
			<div
				className={
					'absolute w-40 right-1/2 aspect-square bg-gradient-to-r from-primary/60 to-secondary/60 rounded-full blur-3xl'
				}
			></div>
			<div className={'flex size-full flex-1 z-5'}>{children}</div>
		</div>
	);
}
