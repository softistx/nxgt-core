import { format } from 'date-fns';
import { Clock } from 'lucide-react';
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useState,
} from 'react';
import { useMedia } from 'react-use';
import { cn } from '../../lib/utils';
import { Button } from './buttons';
import { Dialog, DialogContent, DialogTrigger } from './dialog';
import { HelperText } from './helper-text';
import { inputDefaultClassNames } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { TimePicker } from './time-picker';
import { Typography } from './typography';

export type TimeFieldProps = {
	value?: Date;
	onValueChange?: (value?: Date) => void;
	name?: string;
} & {
	placeholder?: string;
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	required?: boolean;
	disabled?: boolean;
} & Omit<ComponentProps<'div'>, 'onChange'>;

export function TimeField({
	value,
	label,
	helperText,
	error,
	onValueChange,
	placeholder,
	className,
	...props
}: TimeFieldProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMedia('(min-width: 768px)');

	const handleSelection = useCallback(
		(selected?: Date) => {
			onValueChange?.(selected);
		},
		[onValueChange],
	);

	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger
					data-slot="time-field-trigger"
					disabled={props.disabled}
				>
					<TimeFieldTrigger
						open={open}
						label={label}
						helperText={helperText}
						placeholder={placeholder}
						value={value ? value : new Date()}
						error={error}
						className={className}
						{...props}
					/>
				</PopoverTrigger>
				<PopoverContent
					className="flex flex-col gap-0.5 w-auto items-end p-0"
					align="end"
					data-slot="time-field-content"
				>
					<TimePicker
						date={value}
						onChange={handleSelection}
						footer={
							<Button
								className="self-end"
								onClick={() => {
									setOpen(false);
								}}
							>
								OK
							</Button>
						}
						className="min-w-[280px]"
						{...props}
					/>
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger data-slot="time-field-trigger" disabled={props.disabled}>
				<TimeFieldTrigger
					open={open}
					label={label}
					helperText={helperText}
					placeholder={placeholder}
					value={value}
					error={error}
					className={className}
				/>
			</DialogTrigger>
			<DialogContent
				className="max-w-min w-auto p-0 [&>button]:hidden"
				data-slot="time-field-content"
			>
				<TimePicker
					date={value}
					onChange={handleSelection}
					footer={
						<Button
							variant={'filled'}
							className="self-end"
							onClick={() => {
								setOpen(false);
							}}
						>
							OK
						</Button>
					}
				/>
			</DialogContent>
		</Dialog>
	);
}

export function TimeFieldTrigger({
	value,
	label,
	helperText,
	error,
	placeholder,
	className,
	open,
	required,
	name,
	...props
}: TimeFieldProps & {
	open: boolean;
}) {
	return (
		<div
			data-slot="time-field"
			className={cn('grid w-full gap-1.5', className)}
			data-pw={name ?? 'time-field'}
			{...props}
		>
			<Label withAsterisk={required}>{label}</Label>
			<div className="flex flex-col gap-0.5">
				<div
					data-filled={!!value}
					aria-invalid={error}
					className={cn(
						inputDefaultClassNames,
						"justify-between [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-5 [&_svg]:text-foreground/80",
						{
							'border-primary ring-[3px] ring-primary/30': open,
						},
					)}
				>
					{value ? (
						<Typography>{format(value, 'p')}</Typography>
					) : (
						<Typography data-placeholder className="text-foreground/80">
							{placeholder}
						</Typography>
					)}
					<Clock />
				</div>
				{helperText && <HelperText error={error}>{helperText}</HelperText>}
			</div>
		</div>
	);
}
