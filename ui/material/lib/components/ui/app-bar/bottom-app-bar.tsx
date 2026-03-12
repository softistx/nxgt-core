import type { ComponentProps } from 'react';
import { cn } from '../../../lib/utils';
import styles from './bottom-app-bar.module.css';

export type BottomAppBarProps = {} & ComponentProps<'div'>;

export function BottomAppBar({
	children,
	className,
	...props
}: BottomAppBarProps) {
	return (
		<div
			data-slot="bottom-app-bar"
			className={cn(styles.main, className)}
			{...props}
		>
			{children}
		</div>
	);
}
