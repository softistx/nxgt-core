import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

type CircularProgressProps = {
	value: number;
	renderLabel?: (progress: number) => number | string;
	size?: number;
	strokeWidth?: number;
	circleStrokeWidth?: number;
	progressStrokeWidth?: number;
	shape?: 'square' | 'round';
	className?: string;
	progressClassName?: string;
	labelClassName?: string;
	showLabel?: boolean;
} & ComponentProps<'div'> &
	VariantProps<typeof variants>;

const variants = cva('transition-all', {
	variants: {
		variant: {
			primary:
				'*:data-[slot=circular-progress-circle]:stroke-primary/25 *:data-[slot=circular-progress-indicator]:stroke-primary',
			secondary:
				'*:data-[slot=circular-progress-circle]:stroke-secondary/25 *:data-[slot=circular-progress-indicator]:stroke-secondary',
			info: '*:data-[slot=circular-progress-circle]:stroke-info/25 *:data-[slot=circular-progress-indicator]:stroke-info',
			warning:
				'*:data-[slot=circular-progress-circle]:stroke-warning/25 *:data-[slot=circular-progress-indicator]:stroke-warning',
			default:
				'*:data-[slot=circular-progress-circle]:stroke-foreground/25 *:data-[slot=circular-progress-indicator]:stroke-foreground',
			error:
				'*:data-[slot=circular-progress-circle]:stroke-error/25 *:data-[slot=circular-progress-indicator]:stroke-error',
			success:
				'*:data-[slot=circular-progress-circle]:stroke-success/25 *:data-[slot=circular-progress-indicator]:stroke-success',
		},
	},
	defaultVariants: {
		variant: 'primary',
	},
});

export const CircularProgress = ({
	value,
	renderLabel,
	className,
	progressClassName,
	labelClassName,
	showLabel,
	shape = 'round',
	size = 100,
	strokeWidth,
	circleStrokeWidth = 10,
	progressStrokeWidth = 10,
	variant,
	...props
}: CircularProgressProps) => {
	const radius = size / 2 - 10;
	const circumference = Math.ceil(3.14 * radius * 2);
	const percentage = Math.ceil(circumference * ((100 - value) / 100));
	const viewBox = `-${size * 0.125} -${size * 0.125} ${size * 1.25} ${
		size * 1.25
	}`;
	return (
		<div
			data-variant={variant}
			data-slot="circular-progress-wrapper"
			className="relative"
			{...props}
		>
			<svg
				width={size}
				height={size}
				viewBox={viewBox}
				version="1.1"
				xmlns="http://www.w3.org/2000/svg"
				style={{ transform: 'rotate(-90deg)' }}
				className={cn('relative', variants({ variant }))}
				data-slot="circular-progress"
			>
				<title>Progress: {value}%</title>
				<circle
					r={radius}
					cx={size / 2}
					cy={size / 2}
					fill="transparent"
					strokeWidth={strokeWidth ?? circleStrokeWidth}
					strokeDasharray={circumference}
					strokeDashoffset="0"
					className={cn(className)}
					data-slot="circular-progress-circle"
				/>
				<circle
					r={radius}
					cx={size / 2}
					cy={size / 2}
					strokeWidth={strokeWidth ?? progressStrokeWidth}
					strokeLinecap={shape}
					strokeDashoffset={percentage}
					fill="transparent"
					strokeDasharray={circumference}
					className={cn(progressClassName)}
					data-slot="circular-progress-indicator"
				/>
			</svg>
			{showLabel && (
				<div
					data-slot="circular-progress-label"
					className={cn(
						'absolute inset-0 flex center text-md text-foreground',
						labelClassName,
					)}
				>
					{renderLabel ? renderLabel(value) : value}
				</div>
			)}
		</div>
	);
};
