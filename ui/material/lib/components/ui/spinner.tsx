import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export type SpinnerProps = {} & ComponentProps<'div'> &
	VariantProps<typeof variants>;

const variants = cva('transition-all duration-500', {
	variants: {
		variant: {
			'1': '',
			'2': '',
			'3': '',
			'4': '',
		},
		color: {
			primary: null,
			secondary: null,
			info: null,
			warning: null,
			default: null,
			error: null,
			success: null,
			light: null,
		},
	},
	defaultVariants: {
		variant: '1',
		color: 'primary',
	},
	compoundVariants: [
		{
			variant: '1',
			color: 'primary',
			className: 'border-primary/10 border-t-primary',
		},
		{
			variant: '1',
			color: 'secondary',
			className: 'border-secondary/10 border-t-secondary',
		},
		{
			variant: '1',
			color: 'success',
			className: 'border-success/10 border-t-success',
		},
		{
			variant: '1',
			color: 'info',
			className: 'border-info/10 border-t-info',
		},
		{
			variant: '1',
			color: 'warning',
			className: 'border-warning/10 border-t-warning',
		},
		{
			variant: '1',
			color: 'error',
			className: 'border-error/10 border-t-error',
		},
		{
			variant: '1',
			color: 'default',
			className: 'border-foreground/10 border-t-foreground',
		},
		{
			variant: '1',
			color: 'default',
			className: 'border-white/10 border-t-white',
		},
		{
			variant: '2',
			color: 'primary',
			className: 'border-primary/10 border-b-primary border-t-primary',
		},
		{
			variant: '2',
			color: 'secondary',
			className: 'border-secondary/10 border-b-secondary border-t-secondary',
		},
		{
			variant: '2',
			color: 'success',
			className: 'border-success/10 border-b-success border-t-success',
		},
		{
			variant: '2',
			color: 'info',
			className: 'border-info/10 border-b-info border-t-info',
		},
		{
			variant: '2',
			color: 'warning',
			className: 'border-warning/10 border-b-warning border-t-warning',
		},
		{
			variant: '2',
			color: 'error',
			className: 'border-error/10 border-b-error border-t-error',
		},
		{
			variant: '2',
			color: 'default',
			className: 'border-foreground/10 border-b-foreground border-t-foreground',
		},
		{
			variant: '2',
			color: 'light',
			className: 'border-white/10 border-b-white border-t-white',
		},
		{
			variant: '3',
			color: 'primary',
			className:
				'border-primary/10 border-b-primary border-t-primary border-r-primary',
		},
		{
			variant: '3',
			color: 'secondary',
			className:
				'border-secondary/10 border-b-secondary border-t-secondary border-r-secondary',
		},
		{
			variant: '3',
			color: 'success',
			className:
				'border-success/10 border-b-success border-t-success border-r-success',
		},
		{
			variant: '3',
			color: 'info',
			className: 'border-info/10 border-b-info border-t-info border-r-info',
		},
		{
			variant: '3',
			color: 'warning',
			className:
				'border-warning/10 border-b-warning border-t-warning border-r-warning',
		},
		{
			variant: '3',
			color: 'error',
			className: 'border-error/10 border-b-error border-t-error border-r-error',
		},
		{
			variant: '3',
			color: 'default',
			className:
				'border-foreground/10 border-b-foreground border-t-foreground border-r-foreground',
		},
		{
			variant: '3',
			color: 'light',
			className: 'border-white/10 border-b-white border-t-white border-r-white',
		},
		{
			variant: '4',
			color: 'primary',
			className: 'stroke-primary',
		},
		{
			variant: '4',
			color: 'secondary',
			className: 'stroke-secondary',
		},
		{
			variant: '4',
			color: 'success',
			className: 'stroke-success',
		},
		{
			variant: '4',
			color: 'info',
			className: 'stroke-info',
		},
		{
			variant: '4',
			color: 'warning',
			className: 'stroke-warning',
		},
		{
			variant: '4',
			color: 'error',
			className: 'stroke-error',
		},
		{
			variant: '4',
			color: 'default',
			className: 'stroke-foreground',
		},
		{
			variant: '4',
			color: 'light',
			className: 'stroke-white',
		},
	],
});

export function Spinner({
	variant = '1',
	color,
	className,
	...props
}: SpinnerProps) {
	if (variant === '4') {
		return (
			<>
				<style>
					{`@keyframes spin {
            to {
              transform: rotate(360deg);
            }
          }
        
          @keyframes spin2 {
            0% {
              stroke-dasharray: 1, 800;
              stroke-dashoffset: 0;
            }
            50% {
              stroke-dasharray: 400, 400;
              stroke-dashoffset: -200px;
            }
            100% {
              stroke-dasharray: 800, 1;
              stroke-dashoffset: -800px;
            }
          }
        
          .spin2 {
            transform-origin: center;
            animation: spin2 1.5s ease-in-out infinite,
              spin 2s linear infinite;
            animation-direction: alternate;
          }`}
				</style>
				<svg
					viewBox="0 0 800 800"
					data-slot="spinner"
					data-variant={variant}
					data-color={color}
					className={cn('size-14', className)}
					xmlns="http://www.w3.org/2000/svg"
				>
					<title>Loading...</title>
					<circle
						className={cn('spin2', variants({ variant, color }))}
						cx="400"
						cy="400"
						fill="none"
						r="200"
						strokeWidth="50"
						strokeDasharray="700 1400"
						strokeLinecap="round"
					/>
				</svg>
			</>
		);
	}
	return (
		<div
			data-slot="spinner"
			data-variant={variant}
			data-color={color}
			className={cn(
				'size-12 border-[2px] rounded-full animate-spin',
				variants({ variant, color, className }),
			)}
			{...props}
		/>
	);
}
