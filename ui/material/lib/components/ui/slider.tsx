import * as SliderPrimitive from '@radix-ui/react-slider';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';

export type SliderProps = {
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	required?: boolean;
	leading?: ReactNode;
	trailing?: ReactNode;
} & ComponentProps<typeof SliderPrimitive.Root>;

export function Slider({
	leading,
	trailing,
	label,
	helperText,
	error,
	required,
	...props
}: SliderProps) {
	if (props.orientation === 'vertical') {
		return <Comp {...props} />;
	}
	return (
		<div className="grid w-full gap-4 pb-1" data-slot="slider-field">
			{label && (
				<Label withAsterisk={required} className="flex w-full justify-between">
					{label}
					<div
						data-slot="slider-value"
						className="flex flex-1 text-muted-foreground justify-end font-normal"
					>
						{props.value?.join(' - ') ?? ''}
					</div>
				</Label>
			)}
			{helperText ? (
				<div className="flex flex-col gap-2">
					<div className="flex gap-1 text-muted-foreground text-xs">
						{leading}
						<Comp {...props} />
						{trailing}
					</div>
					<HelperText error={error}>{helperText}</HelperText>
				</div>
			) : (
				<div className="flex gap-1 text-muted-foreground text-xs">
					{leading}
					<Comp {...props} />
					{trailing}
				</div>
			)}
		</div>
	);
}

function Comp({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
	const _values = Array.isArray(value)
		? value
		: Array.isArray(defaultValue)
			? defaultValue
			: [min, max];

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			data-pw={props.name ?? 'slider'}
			className={cn(
				'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className={cn(
					'bg-muted cursor-pointer relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
				)}
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className={cn(
						'bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
					)}
				/>
			</SliderPrimitive.Track>
			{Array.from({ length: _values.length }, (_, index) => (
				<SliderPrimitive.Thumb
					data-slot="slider-thumb"
					key={`item-${index.toString()}`}
					data-pw={props.name ? `${props.name}-thumb-${index}` : 'slider-thumb'}
					className="border-primary cursor-pointer bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	);
}
