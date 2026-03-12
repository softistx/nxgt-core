import type { FieldConfig } from '../field/types';
import type {
	FilterField,
	FilterGroup,
	FilterSchema,
	FilterValues,
} from './types';

/**
 * Get a filter field by ID from schema
 */
export function getFilterField(
	schema: FilterSchema,
	fieldId: string,
): FilterField | undefined {
	return schema.fields.find((field) => field.id === fieldId);
}

/**
 * Get filter fields for a specific group
 */
export function getGroupFields(
	schema: FilterSchema,
	group: FilterGroup,
): FilterField[] {
	return group.fields
		.map((fieldId) => getFilterField(schema, fieldId))
		.filter((field): field is FilterField => field !== undefined);
}

/**
 * Get ungrouped filter fields
 */
export function getUngroupedFields(schema: FilterSchema): FilterField[] {
	if (!schema.groups || schema.groups.length === 0) {
		return schema.fields;
	}

	const groupedFieldIds = new Set(
		schema.groups.flatMap((group) => group.fields),
	);

	return schema.fields.filter((field) => !groupedFieldIds.has(field.id));
}

/**
 * Get label for a filter field
 */
export function getFilterFieldLabel(
	schema: FilterSchema,
	fieldId: string,
): string {
	const field = getFilterField(schema, fieldId);
	return field?.label || fieldId;
}

/**
 * Initialize default values from schema
 */
export function getDefaultValuesFromSchema(schema: FilterSchema): FilterValues {
	const defaults: FilterValues = {};

	for (const field of schema.fields) {
		if (field.defaultValue !== undefined) {
			defaults[field.id] = field.defaultValue;
		}
	}

	return defaults;
}

/**
 * Check if a field should be visible based on conditional visibility
 */
export function isFieldVisible(
	field: FilterField,
	values: FilterValues,
): boolean {
	if (!field.visibleWhen) return true;
	return field.visibleWhen(values);
}

/**
 * Get all visible fields from schema
 */
export function getVisibleFields(
	schema: FilterSchema,
	values: FilterValues,
): FilterField[] {
	return schema.fields.filter((field) => isFieldVisible(field, values));
}

/**
 * Map a FilterField to FieldConfig for use with generic Field component
 */
export function mapFilterFieldToFieldConfig(
	field: FilterField,
	value: any,
	onChange: (value: any) => void,
	error?: string,
	disabled?: boolean,
): FieldConfig | null {
	const baseConfig = {
		label: field.label,
		placeholder: field.placeholder,
		disabled: disabled || field.disabled,
		error: !!error,
		helperText: error || field.description,
	};

	switch (field.type) {
		case 'text':
			return {
				type: 'text',
				...baseConfig,
				value: (value as string) || '',
				onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
					onChange(e.target.value),
				maxLength: field.maxLength,
			};

		case 'number':
			return {
				type: 'number',
				...baseConfig,
				value: (value as number) || '',
				onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
					onChange(e.target.valueAsNumber),
				inputMode: 'numeric',
			};

		case 'select':
			return {
				type: 'select',
				...baseConfig,
				value: String(value || ''),
				onValueChange: onChange,
				options:
					field.options?.map((opt) => ({
						label: opt.label,
						value: String(opt.value),
					})) || [],
			};

		case 'multi-select':
			return {
				type: 'autocomplete',
				...baseConfig,
				mode: 'multiple',
				value: (value as string[]) || [],
				onValueChange: onChange,
				options:
					field.options?.map((opt) => ({
						label: opt.label,
						value: String(opt.value),
						disabled: opt.disabled,
					})) || [],
			};

		case 'chips-single':
		case 'chips-multiple':
			return {
				type: field.type,
				...baseConfig,
				mode: field.type === 'chips-multiple' ? 'multiple' : 'single',
				value: (value as string[]) || [],
				onValueChange: onChange,
				options:
					field.options?.map((opt) => ({
						label: opt.label,
						value: String(opt.value),
						disabled: opt.disabled,
					})) || [],
			};

		case 'radio-group':
			return {
				type: 'radio-group',
				...baseConfig,
				value: value ? String(value) : '',
				onValueChange: onChange,
				options:
					field.options?.map((opt) => ({
						label: opt.label,
						value: String(opt.value),
						disabled: opt.disabled,
					})) || [],
			};

		case 'checkbox-group':
			return {
				type: 'checkbox-group',
				...baseConfig,
				value: (value as string[]) || [],
				onValueChange: onChange,
				options:
					field.options?.map((opt) => ({
						label: opt.label,
						value: String(opt.value),
						disabled: opt.disabled,
					})) || [],
			};

		case 'switch':
			return {
				type: 'switch',
				...baseConfig,
				checked: (value as boolean) || false,
				onCheckedChange: onChange,
			} as unknown as FieldConfig;

		case 'date':
			return {
				type: 'date',
				...baseConfig,
				value: value instanceof Date ? value : undefined,
				onValueChange: (date) => onChange(date || null),
			};

		case 'date-range': {
			const filterRange = value as { start?: Date; end?: Date } | undefined;
			const dateRange = filterRange
				? { from: filterRange.start, to: filterRange.end }
				: undefined;

			return {
				type: 'date-range',
				...baseConfig,
				value: dateRange,
				onValueChange: (range) => {
					if (range) {
						const r = range as { from?: Date; to?: Date };
						onChange({ start: r.from, end: r.to });
					} else {
						onChange(undefined);
					}
				},
			};
		}

		case 'slider':
			return {
				type: 'slider',
				...baseConfig,
				step: field.step,
				value: value ? [Number(value)] : [0],
				onValueChange: (value) => onChange(value[0] ?? 0),
			};

		default:
			return null; // Special cases like slider-range, number-range not supported by generic Field
	}
}
