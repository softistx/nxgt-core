'use client';

import { useMemo } from 'react';
import { cn } from '../../../lib';
import { Field } from '../field';
import { Separator } from '../separator';
import { Slider } from '../slider';
import { TextField } from '../text-field';
import { mapFilterFieldToFieldConfig } from './filter-schema.utils';
import type {
	FilterField as FilterFieldType,
	FilterType,
	FilterValue,
} from './types';

export type FilterFieldProps = {
	field: FilterFieldType;
	value: FilterValue;
	onChange: (value: FilterValue) => void;
	onBlur?: () => void;
	error?: string;
	disabled?: boolean;
	className?: string;
};

/**
 * FilterField - Renders a single filter field based on its type
 */
export function FilterField({
	field,
	value,
	onChange,
	onBlur,
	error,
	disabled = false,
	className,
}: FilterFieldProps) {
	const commonProps = useMemo(
		() => ({
			label: field.label,
			placeholder: field.placeholder,
			disabled: disabled || field.disabled,
			error: !!error,
			helperText: error || field.description,
			className: cn(className, {
				'col-start-1 col-span-full': (
					[
						'checkbox-group',
						'radio-group',
						'multi-select',
						'chips-single',
						'chips-multiple',
					] as FilterType[]
				).includes(field.type),
			}),
		}),
		[className, disabled, error, field],
	);

	// Try to use generic Field component for supported types
	const config = useMemo(() => {
		const result = mapFilterFieldToFieldConfig(
			field,
			value,
			onChange,
			error,
			disabled,
		);
		return result
			? {
					...result,
					className: commonProps.className,
				}
			: undefined;
	}, [field, value, onChange, error, disabled, commonProps.className]);

	const renderFieldContent = () => {
		// Custom render function takes precedence
		if (field.render) {
			return (
				<div className={className}>
					{field.render({ value, onChange, onBlur, error, disabled })}
				</div>
			);
		}

		if (config) {
			return <Field config={config} />;
		}

		// Fallback to original rendering for special cases
		switch (field.type) {
			case 'slider-range': {
				const range = value as { min: number; max: number } | undefined;
				return (
					<Slider
						{...commonProps}
						min={field.min}
						max={field.max}
						step={field.step}
						value={[range?.min ?? 0, range?.max ?? 0]}
						onValueChange={([min, max]) =>
							onChange({ min: min ?? 0, max: max ?? 0 })
						}
						onBlur={onBlur}
					/>
				);
			}

			case 'number-range': {
				const range = (value as { min?: number; max?: number }) || {};
				return (
					<div className={cn('space-y-3', className)}>
						<div>
							<div className="text-sm font-medium leading-none">
								{field.label}
							</div>
							{field.description && (
								<p className="text-muted-foreground mt-1 text-xs">
									{field.description}
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-3 w-full">
							<TextField
								label="Min"
								type="number"
								value={range.min ?? ''}
								onChange={(e) =>
									onChange({
										...range,
										min: e.target.value ? e.target.valueAsNumber : undefined,
									})
								}
								placeholder={field.min?.toString()}
								disabled={disabled || field.disabled}
								error={!!error}
								inputMode="numeric"
							/>
							<TextField
								label="Max"
								type="number"
								value={range.max ?? ''}
								onChange={(e) =>
									onChange({
										...range,
										max: e.target.value ? e.target.valueAsNumber : undefined,
									})
								}
								placeholder={field.max?.toString()}
								disabled={disabled || field.disabled}
								error={!!error}
								inputMode="numeric"
							/>
						</div>
						{error && <p className="text-error text-xs">{error}</p>}
					</div>
				);
			}

			default:
				return (
					<div className="text-muted-foreground text-sm">
						Unsupported filter type: {field.type}
					</div>
				);
		}
	};

	return (
		<>
			{field.separator === 'before' && (
				<Separator className="col-start-1 col-span-full" />
			)}
			{renderFieldContent()}
			{field.separator === 'after' && (
				<Separator className="col-start-1 col-span-full" />
			)}
		</>
	);
}
