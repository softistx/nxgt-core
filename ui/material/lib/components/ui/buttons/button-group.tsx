import type { ComponentProps } from 'react';
import { cn } from '../../../lib/utils';
import styles from './button-group.module.css';

export type ButtonGroupProps = {} & ComponentProps<'div'>;

export function ButtonGroup({
	children,
	className,
	...props
}: ButtonGroupProps) {
	return (
		<div
			data-slot="button-group"
			className={cn(styles.main, className)}
			{...props}
		>
			{children}
		</div>
	);
}
