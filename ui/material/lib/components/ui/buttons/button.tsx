import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '../../../lib/utils';
import { Spinner, type SpinnerProps } from '../spinner';

const variants = cva(
	"inline-flex center truncate **:truncate gap-2 h-min cursor-pointer whitespace-nowrap rounded-full text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error px-4 py-2 has-[>svg]:px-3",
	{
		variants: {
			variant: {
				filled: 'shadow-xs',
				tonal: 'shadow-xs',
				ghost:
					'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
				outlined: 'border shadow-xs',
				link: 'focus:underline underline-offset-4 hover:underline',
			},
			color: {
				primary: null,
				secondary: null,
				info: null,
				warning: null,
				default: null,
				error: null,
				success: null,
			},
		},
		defaultVariants: {
			variant: 'filled',
			color: 'primary',
		},
		compoundVariants: [
			{
				variant: 'filled',
				color: 'primary',
				class:
					'bg-primary text-primary-foreground hover:bg-primary/90 [&_svg]:data-[slot=icon]:fill-primary-foreground active:bg-primary/70 focus:bg-primary/80',
			},
			{
				variant: 'filled',
				color: 'secondary',
				class:
					'bg-secondary text-secondary-foreground hover:bg-secondary/90 [&_svg]:data-[slot=icon]:fill-secondary-foreground active:bg-secondary/70 focus:bg-secondary/80',
			},
			{
				variant: 'filled',
				color: 'success',
				class:
					'bg-success text-success-foreground hover:bg-success/90 [&_svg]:data-[slot=icon]:fill-success-foreground active:bg-success/70 focus:bg-success/80',
			},
			{
				variant: 'filled',
				color: 'info',
				class:
					'bg-info text-info-foreground hover:bg-info/90 [&_svg]:data-[slot=icon]:fill-info-foreground active:bg-info/70 focus:bg-info/80',
			},
			{
				variant: 'filled',
				color: 'warning',
				class:
					'bg-warning text-warning-foreground hover:bg-warning/90 [&_svg]:data-[slot=icon]:fill-warning-foreground active:bg-warning/70 focus:bg-warning/80',
			},
			{
				variant: 'filled',
				color: 'error',
				class:
					'bg-error text-error-foreground hover:bg-error/90 [&_svg]:data-[slot=icon]:fill-error-foreground active:bg-error/70 focus:bg-error/80',
			},
			{
				variant: 'filled',
				color: 'default',
				class:
					'bg-foreground text-background hover:bg-foreground/90 [&_svg]:data-[slot=icon]:fill-foreground active:bg-foreground/70 focus:bg-foreground/80',
			},
			{
				variant: 'tonal',
				color: 'primary',
				class:
					'bg-primary/15 text-primary hover:bg-primary/10 [&_svg]:data-[slot=icon]:fill-primary active:bg-primary/5 focus:bg-primary/50',
			},
			{
				variant: 'tonal',
				color: 'secondary',
				class:
					'bg-secondary/15 text-secondary hover:bg-secondary/10 [&_svg]:data-[slot=icon]:fill-secondary active:bg-secondary/5 focus:bg-secondary/50',
			},
			{
				variant: 'tonal',
				color: 'info',
				class:
					'bg-info/15 text-info hover:bg-info/10 [&_svg]:data-[slot=icon]:fill-info active:bg-info/5 focus:bg-info/50',
			},
			{
				variant: 'tonal',
				color: 'success',
				class:
					'bg-success/15 text-success hover:bg-success/10 [&_svg]:data-[slot=icon]:fill-success active:bg-success/5 focus:bg-success/50',
			},
			{
				variant: 'tonal',
				color: 'warning',
				class:
					'bg-warning/15 text-warning hover:bg-warning/10 [&_svg]:data-[slot=icon]:fill-warning active:bg-warning/5 focus:bg-warning/50',
			},
			{
				variant: 'tonal',
				color: 'error',
				class:
					'bg-error/15 text-error hover:bg-error/10 [&_svg]:data-[slot=icon]:fill-error active:bg-error/5 focus:bg-error/50',
			},
			{
				variant: 'tonal',
				color: 'default',
				class:
					'bg-foreground/15 text-foreground hover:bg-foreground/10 [&_svg]:data-[slot=icon]:fill-foreground active:bg-muted focus:bg-muted0',
			},
			{
				variant: 'outlined',
				color: 'primary',
				class:
					'text-primary border-primary/50 [&_svg]:data-[slot=icon]:fill-primary focus:bg-primary/20 hover:bg-primary/10 hover:text-primary/90',
			},
			{
				variant: 'outlined',
				color: 'secondary',
				class:
					'text-secondary border-secondary/50 [&_svg]:data-[slot=icon]:fill-secondary focus:bg-secondary/20 hover:bg-secondary/10 hover:text-secondary/90',
			},
			{
				variant: 'outlined',
				color: 'info',
				class:
					'text-info border-info/50 [&_svg]:data-[slot=icon]:fill-info focus:bg-info/20 hover:bg-info/10 hover:text-info/90',
			},
			{
				variant: 'outlined',
				color: 'success',
				class:
					'text-success border-success/50 [&_svg]:data-[slot=icon]:fill-success focus:bg-success/20 hover:bg-success/10 hover:text-success/90',
			},
			{
				variant: 'outlined',
				color: 'warning',
				class:
					'text-warning border-warning/50 [&_svg]:data-[slot=icon]:fill-warning focus:bg-warning/20 hover:bg-warning/10 hover:text-warning/90',
			},
			{
				variant: 'outlined',
				color: 'error',
				class:
					'text-error border-error/50 [&_svg]:data-[slot=icon]:fill-error focus:bg-error/20 hover:bg-error/10 hover:text-error/90',
			},
			{
				variant: 'outlined',
				color: 'default',
				class:
					'text-foreground border-foreground/50 [&_svg]:data-[slot=icon]:fill-foreground focus:bg-foreground/20 hover:bg-foreground/10 hover:text-foreground/90',
			},
			{
				variant: 'link',
				color: 'primary',
				class:
					'text-primary [&_svg]:data-[slot=icon]:fill-primary hover:bg-primary/10 active:bg-primary/5 focus:bg-primary/15',
			},
			{
				variant: 'link',
				color: 'secondary',
				class:
					'text-secondary [&_svg]:data-[slot=icon]:fill-secondary hover:bg-secondary/10 active:bg-secondary/5 focus:bg-secondary/15',
			},
			{
				variant: 'link',
				color: 'success',
				class:
					'text-success [&_svg]:data-[slot=icon]:fill-success hover:bg-success/10 active:bg-success/5 focus:bg-success/15',
			},
			{
				variant: 'link',
				color: 'info',
				class:
					'text-info [&_svg]:data-[slot=icon]:fill-info hover:bg-info/10 active:bg-info/5 focus:bg-info/15',
			},
			{
				variant: 'link',
				color: 'warning',
				class:
					'text-warning [&_svg]:data-[slot=icon]:fill-warning hover:bg-warning/10 active:bg-warning/5 focus:bg-warning/15',
			},
			{
				variant: 'link',
				color: 'error',
				class:
					'text-error [&_svg]:data-[slot=icon]:fill-error hover:bg-error/10 active:bg-error/5 focus:bg-error/15',
			},
			{
				variant: 'link',
				color: 'default',
				class:
					'text-foreground [&_svg]:data-[slot=icon]:fill-foreground hover:bg-foreground/10 active:bg-muted focus:bg-foreground/15',
			},
		],
	},
);

export type ButtonProps = ComponentProps<'button'> &
	VariantProps<typeof variants> & {
		asChild?: boolean;
		loading?: boolean;
		spinnerVariant?: SpinnerProps['variant'];
	};

export function Button({
	className,
	variant = 'filled',
	asChild = false,
	children,
	color,
	loading,
	spinnerVariant = '2',
	disabled,
	onClick,
	type = 'button',
	...props
}: ButtonProps) {
	const Comp = asChild ? Slot : 'button';

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-color={color}
			className={cn(
				'w-max truncate justify-center line-clamp-1 text-ellipsis duration-500',
				variants({ variant, color }),
				className,
			)}
			type={type}
			disabled={disabled}
			onClick={
				loading
					? (e) => {
							e.preventDefault();
						}
					: onClick
			}
			{...props}
		>
			{loading && (
				<Spinner
					variant={spinnerVariant}
					color={variant === 'filled' ? 'light' : color}
					className={cn(
						'starting:scale-0 duration-500',
						spinnerVariant === '4' ? 'size-7.5' : 'size-4.5',
					)}
				/>
			)}
			{children}
		</Comp>
	);
}

export { variants as buttonVariants };
