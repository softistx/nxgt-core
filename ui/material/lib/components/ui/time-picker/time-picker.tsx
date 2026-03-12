'use client';

import {
	type ChangeEvent,
	type ComponentProps,
	type FocusEvent,
	type ReactNode,
	useCallback,
	useRef,
	useState,
} from 'react';
import { cn } from '../../../lib/utils';
import { Input } from '../input';
import { Separator } from '../separator';
import { ToggleGroup, ToggleGroupItem } from '../toggle-group';
import { Typography } from '../typography';
import { formatValue, parseHours, parseMinutes } from './time-picker-utils';

interface TimePickerProps extends Omit<ComponentProps<'div'>, 'onChange'> {
	date?: Date;
	onChange?: (date?: Date) => void;
	label?: ReactNode;
	footer?: ReactNode;
}

export function TimePicker({
	date,
	label,
	footer,
	onChange,
	className,
	...props
}: TimePickerProps) {
	const hoursRef = useRef<HTMLInputElement>(null);
	const minutesRef = useRef<HTMLInputElement>(null);
	const [period, setPeriod] = useState<'AM' | 'PM'>(() =>
		(date?.getHours() ?? 0) > 11 ? 'PM' : 'AM',
	);

	const handleChange =
		(type: 'hour' | 'minute') => (event: ChangeEvent<HTMLInputElement>) => {
			const newDate = new Date(date ?? new Date());

			if (type === 'hour') {
				newDate.setHours(parseHours(event.target.value, period));
				if (event.target.value?.length >= 2) {
					minutesRef.current?.focus();
				}
			} else {
				newDate.setMinutes(parseMinutes(event.target.value));
				if (event.target.value?.length >= 2) {
					minutesRef.current?.blur();
				}
			}
			onChange?.(newDate);
		};

	const handleFocus = useCallback((event: FocusEvent<HTMLInputElement>) => {
		event.target.select();
	}, []);

	const handlePeriodChange = useCallback(
		(value: string) => {
			setPeriod(value === 'AM' ? 'AM' : 'PM');
			const newDate = new Date(date ?? new Date());
			if (value === 'PM') {
				newDate.setHours(newDate.getHours() + 12);
			} else {
				newDate.setHours(newDate.getHours() % 12);
			}

			onChange?.(newDate);
		},
		[onChange, date],
	);

	return (
		<div
			data-slot="time-picker"
			className={cn(
				'flex flex-col w-full max-w-[20rem] *:w-full gap-2 rounded shadow py-1 bg-background',
				className,
			)}
			{...props}
		>
			{label && (
				<>
					<Typography
						variant={'title-medium'}
						data-slot="time-picker-label"
						className="text-muted-foreground pl-2"
					>
						{label}
					</Typography>
					<Separator />
				</>
			)}
			<div
				data-slot="time-picker-main"
				className="flex gap-2 items-center px-2 justify-between"
			>
				<div className="flex h-14 *:min-w-0 *:text-center [&_input]:w-12 items-center gap-2">
					<Input
						ref={hoursRef}
						value={formatValue((date?.getHours() ?? 0) % 12)}
						type="number"
						onChange={handleChange('hour')}
						onFocus={handleFocus}
						className="h-full"
						name="hours"
					/>
					<Typography className="p-0 text-muted-foreground">:</Typography>
					<Input
						ref={minutesRef}
						value={formatValue(date?.getMinutes() ?? 0)}
						type="number"
						onChange={handleChange('minute')}
						onFocus={handleFocus}
						className="h-full"
						name="minutes"
					/>
				</div>
				<div className="grid">
					<ToggleGroup
						type="single"
						value={period}
						className="flex-col"
						onValueChange={handlePeriodChange}
					>
						<ToggleGroupItem value="AM">AM</ToggleGroupItem>
						<ToggleGroupItem value="PM">PM</ToggleGroupItem>
					</ToggleGroup>
				</div>
			</div>
			{footer && (
				<>
					<Separator />
					<div
						data-slot="time-picker-footer"
						className="px-2 flex justify-end gap-2"
					>
						{footer}
					</div>
				</>
			)}
		</div>
	);
}
