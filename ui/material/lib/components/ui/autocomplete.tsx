import { X } from 'lucide-react';
import {
	type ComponentProps,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	useCallback,
	useMemo,
	useState,
} from 'react';
import { useMedia } from 'react-use';
import { cn } from '../../lib/utils';
import { Button } from './buttons/button';
import { iconButtonVariants } from './buttons/icon-button';
import { Chip } from './chip';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from './command';
import { Dialog, DialogContent, DialogTrigger } from './dialog';
import { HelperText } from './helper-text';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Typography } from './typography';

export type AutocompleteOption = { value: string; label: string };

export type AutocompleteProps<
	T extends AutocompleteOption = AutocompleteOption,
> = Omit<ComponentProps<'div'>, 'value'> & {
	searchPlaceholder?: string;
	label?: ReactNode;
	placeholder?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	options: T[];
	getOptionValue?: (option: T) => string;
	getOptionLabel?: (option: T) => string;
	empty?: ReactNode;
	freeSolo?: boolean;
	freeSoloLabel?: (query: string) => string;
	name?: string;
	disabled?: boolean;
	renderOption?: (option: T) => ReactNode;
	renderSelectedLeading?: (option: T) => ReactNode;
} & (
		| {
				mode: 'single';
				value: string;
				onValueChange?: (value: string) => void;
		  }
		| {
				mode: 'multiple';
				value: string[];
				onValueChange?: (value: string[]) => void;
		  }
	);

export function Autocomplete<
	T extends AutocompleteOption = AutocompleteOption,
>({
	value,
	label,
	helperText,
	error,
	onValueChange,
	empty,
	options,
	getOptionValue = (option: T) => (option as AutocompleteOption).value,
	getOptionLabel = (option: T) => (option as AutocompleteOption).label,
	placeholder,
	searchPlaceholder,
	className,
	freeSolo,
	freeSoloLabel,
	name,
	disabled,
	mode,
	renderOption,
	renderSelectedLeading,
	...props
}: AutocompleteProps<T>) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMedia('(min-width: 768px)');

	const fullOptions = useMemo(() => {
		if (!freeSolo) {
			return options;
		}
		if (mode === 'multiple') {
			return [
				...options,
				...(value as string[])
					.filter(
						(item) =>
							!options.some((option) => getOptionValue(option) === item),
					)
					.map((item) => ({ value: item, label: item }) as T),
			];
		}
		return [
			...options,
			...(!options.some((option) => getOptionValue(option) === value) && value
				? [{ value: value as string, label: value as string } as T]
				: []),
		];
	}, [freeSolo, options, value, mode, getOptionValue]);

	const handleRemove = useCallback(
		(target: string) => {
			if (mode === 'multiple') {
				onValueChange?.(value.filter((item) => item !== target));
			}
			if (mode === 'single') {
				onValueChange?.('');
			}
		},
		[mode, onValueChange, value],
	);

	const handleUpdate = useCallback(
		(target: string) => {
			if (mode === 'multiple') {
				if (value.includes(target)) {
					onValueChange?.(value.filter((item) => item !== target));
				} else {
					onValueChange?.([...value, target]);
				}
			}
			if (mode === 'single') {
				if (value === target) {
					onValueChange?.('');
				} else {
					onValueChange?.(target);
				}
			}

			setOpen(false);
		},
		[mode, onValueChange, value],
	);

	if (isDesktop) {
		return (
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger name={name} disabled={disabled} asChild>
					<AutocompleteTrigger
						{...props}
						open={open}
						mode={mode as any}
						value={value as any}
						label={label}
						helperText={helperText}
						placeholder={placeholder || label}
						options={fullOptions}
						error={error}
						className={className}
						onRemove={handleRemove}
						getOptionValue={getOptionValue}
						getOptionLabel={getOptionLabel}
						renderSelectedLeading={renderSelectedLeading}
					/>
				</PopoverTrigger>
				<PopoverContent>
					<AutocompleteItemList
						name={name}
						mode={mode}
						options={fullOptions}
						value={value}
						empty={empty}
						onSelect={handleUpdate}
						freeSolo={freeSolo}
						freeSoloLabel={freeSoloLabel}
						renderOption={renderOption}
						getOptionValue={getOptionValue}
						getOptionLabel={getOptionLabel}
					/>
				</PopoverContent>
			</Popover>
		);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger name={name} disabled={disabled} asChild>
				<AutocompleteTrigger
					{...props}
					open={open}
					mode={mode as any}
					value={value as any}
					label={label}
					helperText={helperText}
					placeholder={placeholder || label}
					options={fullOptions}
					error={error}
					className={className}
					onRemove={handleRemove}
					getOptionValue={getOptionValue}
					getOptionLabel={getOptionLabel}
					renderSelectedLeading={renderSelectedLeading}
				/>
			</DialogTrigger>
			<DialogContent>
				<AutocompleteItemList
					name={name}
					mode={mode}
					options={fullOptions}
					value={value}
					empty={empty}
					onSelect={handleUpdate}
					freeSolo={freeSolo}
					freeSoloLabel={freeSoloLabel}
					renderOption={renderOption}
					getOptionValue={getOptionValue}
					getOptionLabel={getOptionLabel}
				/>
			</DialogContent>
		</Dialog>
	);
}

function AutocompleteItemList<T extends AutocompleteOption>({
	name,
	empty,
	value,
	options,
	searchPlaceholder,
	onSelect,
	freeSolo,
	freeSoloLabel,
	renderOption,
	getOptionValue = (option: T) => (option as AutocompleteOption).value,
	getOptionLabel = (option: T) => (option as AutocompleteOption).label,
}: Pick<
	AutocompleteProps<T>,
	| 'mode'
	| 'name'
	| 'options'
	| 'empty'
	| 'value'
	| 'searchPlaceholder'
	| 'freeSolo'
	| 'freeSoloLabel'
	| 'renderOption'
	| 'getOptionValue'
	| 'getOptionLabel'
> & {
	onSelect: (value: string) => void;
}) {
	const [query, setQuery] = useState('');

	const showAddButton = useMemo(
		() =>
			freeSolo &&
			query &&
			!options.some(
				(option) =>
					getOptionLabel(option)?.toLowerCase() === query.toLowerCase(),
			),
		[freeSolo, query, options, getOptionLabel],
	);

	const handleSelect = useCallback(
		(selectedValue: string) => () => {
			onSelect(selectedValue);
		},
		[onSelect],
	);

	const handleKeyUp = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === 'Enter' && freeSolo && query) {
				event.preventDefault();
				onSelect(query);
			}
		},
		[freeSolo, query, onSelect],
	);

	return (
		<Command>
			<CommandInput
				value={query}
				placeholder={searchPlaceholder ?? 'Search ...'}
				className="h-9"
				onValueChange={setQuery}
				onKeyUp={handleKeyUp}
			/>
			<CommandList>
				<CommandEmpty>
					{showAddButton && (
						<Button variant={'tonal'} onClick={handleSelect(query)}>
							{freeSoloLabel?.(query) ?? `Add "${query}"`}
						</Button>
					)}
					{!freeSolo &&
						!options.some((option) =>
							getOptionLabel(option)
								.toLowerCase()
								.includes(query.toLowerCase()),
						) &&
						(empty || 'No option found.')}
				</CommandEmpty>
				<CommandGroup>
					{options.map((option, index) => (
						<CommandItem
							key={getOptionValue(option)}
							value={getOptionLabel(option)}
							onSelect={() => {
								onSelect(getOptionValue(option));
							}}
							className={cn('border-l-2 border-transparent', {
								'rounded-l-none bg-primary/5 border-primary/60':
									value?.includes(getOptionValue(option)),
							})}
							asChild={!!renderOption}
							aria-selected={!!value?.includes(getOptionValue(option))}
							data-pw={`${name ?? 'option'}-${index}`}
						>
							{renderOption ? renderOption(option) : getOptionLabel(option)}
						</CommandItem>
					))}
				</CommandGroup>
			</CommandList>
		</Command>
	);
}

export function AutocompleteTrigger<T extends AutocompleteOption>({
	value,
	label,
	helperText,
	error,
	onValueChange,
	empty,
	options,
	getOptionValue = (option: T) => (option as AutocompleteOption).value,
	getOptionLabel = (option: T) => (option as AutocompleteOption).label,
	placeholder,
	className,
	onRemove,
	open,
	mode,
	renderSelectedLeading,
	...props
}: AutocompleteProps<T> & {
	onRemove: (value: string) => void;
	open: boolean;
}) {
	const handleRemove = useCallback(
		(item: string) => (event: MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			onRemove(item);
		},
		[onRemove],
	);

	return (
		<div
			data-slot="autocomplete-field"
			className={cn('grid w-full gap-1.5', className)}
		>
			<Label>{label}</Label>
			<div>
				<div
					{...props}
					className={cn(
						'flex gap-2 p-1 flex-wrap min-h-12 items-center w-full min-w-[280px] rounded-sm border transition-all has-disabled:pointer-events-none has-disabled:cursor-not-allowed',
						'focus-within:border-primary focus-within:ring-[3px] focus-within:ring-primary/30',
						'hover:border-primary hover:ring-[2px] hover:ring-primary/25',
						"[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
						'bg-muted/5 has-disabled:bg-transparent',
						'cursor-pointer disabled:cursor-not-allowed',
						{
							'border-primary ring-[3px] ring-primary/30': open,
							'bg-primary/10': !!value?.length,
							'border-error': error,
						},
					)}
				>
					{mode === 'multiple' && Array.isArray(value)
						? value.map((item, index) => {
								const option = options.find(
									(option) => getOptionValue(option) === item,
								);
								return (
									<Chip
										key={`item-${index.toString()}`}
										label={option ? getOptionLabel(option) : item}
										leading={
											(option ? renderSelectedLeading?.(option) : undefined) ??
											''
										}
										trailing={
											<button
												type="button"
												onClick={handleRemove(item)}
												className={cn(iconButtonVariants(), 'size-5')}
											>
												<X />
											</button>
										}
									/>
								);
							})
						: !!value?.length &&
							(() => {
								const option = options.find(
									(option) => getOptionValue(option) === value,
								);
								return (
									<Chip
										label={option ? getOptionLabel(option) : value}
										leading={
											(option ? renderSelectedLeading?.(option) : undefined) ??
											''
										}
										trailing={
											<button
												type="button"
												onClick={handleRemove(value.toString())}
												className={cn(iconButtonVariants(), 'size-5')}
											>
												<X />
											</button>
										}
									/>
								);
							})()}
					{!value?.length && (
						<Typography className="ml-2 text-muted-foreground">
							{placeholder}
						</Typography>
					)}
				</div>
				{helperText && <HelperText error={error}>{helperText}</HelperText>}
			</div>
		</div>
	);
}
