import type { ReactNode } from 'react';
import { useIsMobile } from '../../../hooks';
import { cn } from '../../../lib/utils';
import { Button, type ButtonProps } from '../..';

export type ResponsiveButtonProps = {
	icon: ReactNode;
	expanded?: boolean;
} & ButtonProps;

export function ResponsiveButton({
	icon,
	className,
	children,
	expanded,
	...props
}: ResponsiveButtonProps) {
	const isMobile = useIsMobile();
	return (
		<Button
			data-slot="responsive-button"
			className={cn({ 'size-8': !(expanded ?? !isMobile) }, className)}
			aria-expanded={expanded ?? !isMobile}
			{...props}
		>
			{icon}
			{(expanded ?? !isMobile) && children}
		</Button>
	);
}
