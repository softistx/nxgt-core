'use client';

import { Tooltip, TooltipTrigger } from '@radix-ui/react-tooltip';
import { Info } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { useMedia } from 'react-use';
import { cn } from '../../lib/utils';
import { IconButton } from './buttons/icon-button';
import { TooltipContent } from './tooltip';
import { Typography } from './typography';

type Step = { icon?: ReactNode; title: ReactNode; description?: ReactNode };

export type StepperProps = {
	steps: Step[];
	active?: number;
	renderStepLabel?: (step: Step, index: number) => ReactNode;
	onChange?: (value: number) => void;
	name?: string;
} & Omit<ComponentProps<'div'>, 'onChange'>;

export function Stepper({
	steps,
	active,
	onChange,
	className,
	renderStepLabel,
	name,
	...props
}: StepperProps) {
	const isDesktop = useMedia('(min-width: 768px)');

	return (
		<div
			data-slot="stepper"
			data-pw={name ?? 'stepper'}
			className={cn('grid gap-2 w-full p-1 rounded shadow-xs', className)}
			{...props}
		>
			<div
				data-slot="stepper-steps"
				className="grid max-w-full [&::-webkit-scrollbar]:hidden gap-0.5"
				style={{
					gridTemplateColumns: isDesktop
						? `repeat(${steps.length}, min-content)`
						: 'min-content',
				}}
			>
				{steps.map((step, index) => (
					<div
						key={`#step-${index.toString()}`}
						id={`step-${index}`}
						data-pw={name ? `${name}-step-${index}` : `step-${index}`}
						data-slot="stepper-step"
						className={cn('flex gap-2 min-w-[16rem] max-w-[16rem]', {
							hidden: !isDesktop && active !== index,
						})}
					>
						<StepperIcon
							active={(active ?? 0) === index}
							step={{ ...step, icon: step.icon ?? index.toString() }}
							selected={(active ?? 0) >= index}
						/>
						<div className={cn('flex flex-col max-w-full flex-1', className)}>
							<Typography
								variant={'body-small'}
								className="max-w-full text-muted-foreground line-clamp-1 text-ellipsis order-0"
							>
								{renderStepLabel
									? renderStepLabel(step, index)
									: `Step ${index < 9 ? `0${index + 1}` : index + 1}`}
							</Typography>
							<Typography
								variant={'title-small'}
								className="line-clamp-1 text-ellipsis"
							>
								{step.title}
							</Typography>
						</div>
						{step.description && active === index && (
							<Tooltip>
								<TooltipTrigger>
									<IconButton
										variant={'tonal'}
										className="size-6 animate-pulse"
									>
										<Info />
									</IconButton>
								</TooltipTrigger>
								<TooltipContent className="max-w-xs">
									{step.description}
								</TooltipContent>
							</Tooltip>
						)}
					</div>
				))}
			</div>
			<StepperIndicator current={active ?? 0} max={steps.length} />
		</div>
	);
}

function StepperIcon({
	step,
	selected,
	active,
}: {
	step: Step;
	selected: boolean;
	active?: boolean;
}) {
	return (
		<div
			data-slot="stepper-icon"
			className={cn(
				"transition-all flex h-min center p-2 border rounded-md [&_svg:not([class*='size-'])]:size-5",
				{
					'text-primary-foreground bg-primary': selected,
					'text-muted-foreground border border-muted-foreground/50': !selected,
					'bg-primary animate-pulse': active,
				},
			)}
		>
			{step.icon}
		</div>
	);
}

export function StepperIndicator({
	current,
	max,
}: {
	max: number;
	current: number;
}) {
	return (
		<div
			data-slot="stepper-indicator"
			className={cn(
				'transition-all flex w-full bg-muted-foreground/20 rounded-xs',
			)}
		>
			<div
				className={cn('transition-all duration-300 h-1 bg-primary')}
				style={{
					width: `${((current + 1) / Math.max(1, max)) * 100}%`,
				}}
			></div>
		</div>
	);
}
