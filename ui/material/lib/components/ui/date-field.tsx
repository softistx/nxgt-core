import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useState,
} from 'react';
import { cn } from '../../lib/utils';
import { Button } from './buttons/button';
import { Calendar } from './calendar';
import { HelperText } from './helper-text';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Separator } from './separator';
import { TimePicker } from './time-picker/time-picker';
import { Typography } from './typography';

export type DateFieldProps = {
	value?: Date;
	onValueChange?: (value?: Date) => void;
} & {
	placeholder?: string;
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	required?: boolean;
	showTimePicker?: boolean;
	name?: string;
} & Omit<ComponentProps<typeof Calendar>, 'mode' | 'label' | 'onSelect'>;

export function DateField({
	value,
	label,
	helperText,
	error,
	onValueChange,
	placeholder,
	className,
	...props
}: DateFieldProps) {
	const [open, setOpen] = useState(false);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger
				data-slot="date-field-trigger"
				data-pw={props.name ?? 'date-field'}
				className={cn('w-full', className)}
			>
				<DateFieldTrigger
					open={open}
					label={label}
					helperText={helperText}
					placeholder={placeholder}
					value={value}
					error={error}
				/>
			</PopoverTrigger>
			<PopoverContent
				className="flex flex-col gap-0.5 w-auto p-1 items-end"
				align="start"
				data-slot="date-field-content"
			>
				<DateFieldContent
					value={value}
					onValueChange={onValueChange}
					onOpen={setOpen}
					{...props}
				/>
			</PopoverContent>
		</Popover>
	);
}

export function DateFieldContent({
	value,
	onValueChange,
	onOpen,
	showTimePicker,
	...props
}: DateFieldProps & { onOpen: (value: boolean) => void }) {
	const handleSelection = useCallback(
		(selected?: Date) => {
			onValueChange?.(selected);
			if (!showTimePicker) {
				onOpen(false);
			}
		},
		[onValueChange, showTimePicker, onOpen],
	);

	return (
		<>
			<Calendar
				{...props}
				mode={'single'}
				selected={value}
				onSelect={handleSelection}
			/>
			{showTimePicker && (
				<>
					<Separator />
					<TimePicker
						date={value}
						onChange={handleSelection}
						footer={
							<Button
								className="self-end"
								onClick={() => {
									onOpen(false);
								}}
							>
								OK
							</Button>
						}
					/>
				</>
			)}
		</>
	);
}

export function DateFieldTrigger({
	value,
	label,
	helperText,
	error,
	placeholder,
	className,
	open,
	required,
}: DateFieldProps & {
	open: boolean;
}) {
	return (
		<div
			data-slot="date-field"
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
					{value ? (
						<Typography>{format(value, 'P')}</Typography>
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
