import type { VariantProps } from 'class-variance-authority';
import { ArrowUp } from 'lucide-react';
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useEffect,
	useState,
} from 'react';

import { cn } from '../../lib/utils';
import { IconButton, type iconButtonVariants } from './buttons';

export type ScrollToTopProps = Omit<ComponentProps<'button'>, 'children'> &
	VariantProps<typeof iconButtonVariants> & {
		/**
		 * Scroll threshold in pixels before showing the button
		 * @default 300
		 */
		threshold?: number;
		/**
		 * Scroll behavior when clicking the button
		 * @default 'smooth'
		 */
		behavior?: ScrollBehavior;
		/**
		 * Custom icon to display instead of the default ArrowUp icon
		 */
		icon?: ReactNode;
	};

export function ScrollToTop({
	className,
	variant = 'filled',
	color = 'primary',
	threshold = 300,
	behavior = 'smooth',
	icon,
	onClick,
	...props
}: ScrollToTopProps) {
	const [isVisible, setIsVisible] = useState(false);

	useEffect(() => {
		const toggleVisibility = () => {
			if (window.scrollY > threshold) {
				setIsVisible(true);
			} else {
				setIsVisible(false);
			}
		};

		window.addEventListener('scroll', toggleVisibility);

		// Check initial scroll position
		toggleVisibility();

		return () => {
			window.removeEventListener('scroll', toggleVisibility);
		};
	}, [threshold]);

	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			window.scrollTo({
				top: 0,
				behavior,
			});
			onClick?.(event);
		},
		[behavior, onClick],
	);

	if (!isVisible) {
		return null;
	}

	return (
		<IconButton
			data-slot="scroll-to-top"
			data-variant={variant}
			data-color={color}
			className={cn(
				'animate-in fade-in slide-in-from-bottom-4 duration-300',
				className,
			)}
			onClick={handleClick}
			aria-label="Scroll to top"
			{...props}
		>
			{icon || <ArrowUp data-slot="icon" />}
		</IconButton>
	);
}
