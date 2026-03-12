import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { cn } from '../../lib/utils';
import { Calendar, type DateRange } from './calendar';
import { HelperText } from './helper-text';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Typography } from './typography';

export type DateRangeFieldProps = {
	value?: DateRange;
	onValueChange?: (value?: DateRange) => void;
} & {
	placeholder?: string;
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	required?: boolean;
	name?: string;
} & Omit<ComponentProps<typeof Calendar>, 'mode' | 'label' | 'onSelect'>;

export function DateRangeField({
	value,
	label,
	helperText,
	error,
	onValueChange,
	placeholder,
	className,
	...props
}: DateRangeFieldProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger className={cn('w-full', className)}>
				<DateRangeFieldTrigger
					open={open}
					label={label}
					helperText={helperText}
					placeholder={placeholder}
					value={value}
					error={error}
					data-pw={props.name ?? 'date-range-field'}
				/>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					{...props}
					mode={'range'}
					defaultMonth={value?.from}
					selected={value}
					onSelect={onValueChange}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function DateRangeFieldTrigger({
	value,
	label,
	helperText,
	error,
	placeholder,
	className,
	open,
	required,
}: DateRangeFieldProps & {
	open: boolean;
}) {
	return (
		<div
			data-slot="date-range-field"
			className={cn('grid w-full gap-1.5', className)}
		>
			<Label withAsterisk={required}>{label}</Label>
			<div className="flex flex-col gap-0.5">
				<div
					className={cn(
						'flex justify-between gap-2 p-1 px-3 flex-wrap min-h-11 items-center w-full rounded-sm border transition-all has-disabled:pointer-events-none has-disabled:cursor-not-allowed',
						'focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/30',
						'hover:border-primary hover:ring-[2px] hover:ring-primary/25',
						"[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 [&_svg]:text-foreground/80",
						'bg-muted/5 has-disabled:bg-transparent',
						'cursor-pointer disabled:cursor-not-allowed',
						{
							'border-primary ring-[3px] ring-primary/30': open,
							'bg-primary/10': !!value,
							'border-error': error,
						},
					)}
				>
					{value?.from ? (
						value.to ? (
							<Typography>
								{format(value.from, 'P')} - {format(value.to, 'P')}
							</Typography>
						) : (
							<Typography>{format(value.from, 'P')}</Typography>
						)
					) : (
						<Typography data-placeholder className="text-foreground/80">
							{placeholder}
						</Typography>
					)}
					<CalendarIcon />
				</div>
				{helperText && <HelperText error={error}>{helperText}</HelperText>}
			</div>
		</div>
	);
}
