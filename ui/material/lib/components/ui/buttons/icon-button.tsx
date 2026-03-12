import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../../lib/utils';

export type IconButtonProps = { asChild?: boolean } & ComponentProps<'button'> &
	VariantProps<typeof variants>;

export const variants = cva(
	"inline-flex size-9 center gap-2 cursor-pointer whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:bg-transparent [&_svg]:text-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error has-[[data-slot=icon]]:p-1.5 aspect-square rounded-full",
	{
		variants: {
			variant: {
				filled:
					'shadow-xs bg-primary text-primary-foreground [&_svg]:data-[slot=icon]:fill-primary-foreground [&_svg]:stroke-primary-foreground hover:bg-primary/90 active:bg-primary/70 focus:bg-primary/80',
				tonal:
					'shadow-xs bg-primary/15 [&_svg]:data-[slot=icon]:fill-primary [&_svg]:stroke-primary text-primary hover:bg-primary/10 active:bg-primary/5 focus:bg-primary/50',
				ghost:
					'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
				outlined:
					'border shadow-xs text-primary [&_svg]:data-[slot=icon]:fill-primary [&_svg]:stroke-primary border-primary/50 focus:bg-primary/20 hover:bg-primary/10 hover:text-primary/90',
				link: 'text-primary [&_svg]:data-[slot=icon]:fill-primary [&_svg]:stroke-primary underline-offset-4 hover:underline hover:bg-primary/10 active:bg-primary/5 focus:bg-primary/15 focus:text-accent focus:underline',
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
					'bg-primary text-primary-foreground [&_svg]:data-[slot=icon]:fill-primary-foreground [&_svg]:stroke-primary-foreground hover:bg-primary/90 active:bg-primary/70 focus:bg-primary/80',
			},
			{
				variant: 'filled',
				color: 'secondary',
				class:
					'bg-secondary text-secondary-foreground [&_svg]:data-[slot=icon]:fill-secondary-foreground [&_svg]:stroke-secondary-foreground hover:bg-secondary/90 active:bg-secondary/70 focus:bg-secondary/80',
			},
			{
				variant: 'filled',
				color: 'success',
				class:
					'bg-success text-success-foreground [&_svg]:data-[slot=icon]:fill-success-foreground [&_svg]:stroke-success-foreground hover:bg-success/90 active:bg-success/70 focus:bg-success/80',
			},
			{
				variant: 'filled',
				color: 'info',
				class:
					'bg-info text-info-foreground [&_svg]:data-[slot=icon]:fill-info-foreground [&_svg]:stroke-info-foreground hover:bg-info/90 active:bg-info/70 focus:bg-info/80',
			},
			{
				variant: 'filled',
				color: 'warning',
				class:
					'bg-warning text-warning-foreground [&_svg]:data-[slot=icon]:fill-warning-foreground [&_svg]:stroke-warning-foreground hover:bg-warning/90 active:bg-warning/70 focus:bg-warning/80',
			},
			{
				variant: 'filled',
				color: 'error',
				class:
					'bg-error text-error-foreground [&_svg]:data-[slot=icon]:fill-error-foreground [&_svg]:stroke-error-foreground hover:bg-error/90 active:bg-error/70 focus:bg-error/80',
			},
			{
				variant: 'filled',
				color: 'default',
				class:
					'bg-foreground text-background [&_svg]:data-[slot=icon]:fill-foreground [&_svg]:stroke-foreground hover:bg-foreground/90 active:bg-foreground/70 focus:bg-foreground/80',
			},
			{
				variant: 'tonal',
				color: 'primary',
				class:
					'bg-primary/15 [&_svg]:data-[slot=icon]:fill-primary [&_svg]:stroke-primary text-primary hover:bg-primary/10 active:bg-primary/5 focus:bg-primary/50',
			},
			{
				variant: 'tonal',
				color: 'secondary',
				class:
					'bg-secondary/15 [&_svg]:data-[slot=icon]:fill-secondary [&_svg]:stroke-secondary text-secondary hover:bg-secondary/10 active:bg-secondary/5 focus:bg-secondary/50',
			},
			{
				variant: 'tonal',
				color: 'success',
				class:
					'bg-success/15 [&_svg]:data-[slot=icon]:fill-success [&_svg]:stroke-success text-success hover:bg-success/10 active:bg-success/5 focus:bg-success/50',
			},
			{
				variant: 'tonal',
				color: 'info',
				class:
					'bg-info/15 [&_svg]:data-[slot=icon]:fill-info [&_svg]:stroke-info text-info hover:bg-info/10 active:bg-info/5 focus:bg-info/50',
			},
			{
				variant: 'tonal',
				color: 'warning',
				class:
					'bg-warning/15 [&_svg]:data-[slot=icon]:fill-warning [&_svg]:stroke-warning text-warning hover:bg-warning/10 active:bg-warning/5 focus:bg-warning/50',
			},
			{
				variant: 'tonal',
				color: 'error',
				class:
					'bg-error/15 [&_svg]:data-[slot=icon]:fill-error [&_svg]:stroke-error text-error hover:bg-error/10 active:bg-error/5 focus:bg-error/50',
			},
			{
				variant: 'tonal',
				color: 'default',
				class:
					'bg-foreground/15 [&_svg]:data-[slot=icon]:fill-foreground [&_svg]:stroke-foreground text-foreground hover:bg-foreground/10 active:bg-muted focus:bg-muted0',
			},
			{
				variant: 'outlined',
				color: 'primary',
				class:
					'text-primary [&_svg]:data-[slot=icon]:fill-primary [&_svg]:stroke-primary border-primary/50 focus:bg-primary/20 hover:bg-primary/10 hover:text-primary/90',
			},

			{
				variant: 'outlined',
				color: 'secondary',
				class:
					'text-secondary [&_svg]:data-[slot=icon]:fill-secondary [&_svg]:stroke-secondary border-secondary/50 focus:bg-secondary/20 hover:bg-secondary/10 hover:text-secondary/90',
			},
			{
				variant: 'outlined',
				color: 'success',
				class:
					'text-success [&_svg]:data-[slot=icon]:fill-success [&_svg]:stroke-success border-success/50 focus:bg-success/20 hover:bg-success/10 hover:text-success/90',
			},
			{
				variant: 'outlined',
				color: 'info',
				class:
					'text-info [&_svg]:data-[slot=icon]:fill-info [&_svg]:stroke-info border-info/50 focus:bg-info/20 hover:bg-info/10 hover:text-info/90',
			},
			{
				variant: 'outlined',
				color: 'warning',
				class:
					'text-warning [&_svg]:data-[slot=icon]:fill-warning [&_svg]:stroke-warning border-warning/50 focus:bg-warning/20 hover:bg-warning/10 hover:text-warning/90',
			},
			{
				variant: 'outlined',
				color: 'error',
				class:
					'text-error [&_svg]:data-[slot=icon]:fill-error [&_svg]:stroke-error border-error/50 focus:bg-error/20 hover:bg-error/10 hover:text-error/90',
			},
			{
				variant: 'outlined',
				color: 'default',
				class:
					'text-foreground [&_svg]:data-[slot=icon]:fill-foreground [&_svg]:stroke-foreground border-foreground/50 focus:bg-foreground/20 hover:bg-foreground/10 hover:text-foreground/90',
			},
		],
	},
);

export function IconButton({
	variant,
	color,
	className,
	asChild,
	type = 'button',
	...props
}: IconButtonProps) {
	const Comp = asChild ? Slot : 'button';
	return (
		<Comp
			data-slot="icon-button"
			data-variant={variant}
			data-color={color}
			type={type}
			className={cn(variants({ variant, color, className }))}
			{...props}
		></Comp>
	);
}

export { variants as iconButtonVariants };
