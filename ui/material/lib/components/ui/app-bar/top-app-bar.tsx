import type { ComponentProps } from 'react';
import { cn } from '../../../lib/utils';

export type TopAppBarProps = {} & ComponentProps<'div'>;

export function TopAppBar({ className, ...props }: TopAppBarProps) {
	return (
		<div
			data-slot="top-app-bar"
			className={cn(
				'flex items-center gap-4 px-4 py-2 bg-surface text-on-surface border-b',
				className,
			)}
			{...props}
		/>
	);
}
