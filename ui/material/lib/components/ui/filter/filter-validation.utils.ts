import { VALIDATION_MESSAGES } from './consts';
import { isFilterValueEmpty } from './filter.utils';
import type {
	FilterField,
	FilterSchema,
	FilterValidationErrors,
	FilterValidationRule,
	FilterValue,
	FilterValues,
} from './types';

/**
 * Validate a single filter value against its validation rules
 */
export function validateFilterValue(
	field: FilterField,
	value: FilterValue,
): string | null {
	const rules = field.validation;
	if (!rules) return null;

	// Required validation
	if (rules.required && isFilterValueEmpty(value)) {
		return VALIDATION_MESSAGES.REQUIRED;
	}

	// Skip other validations if value is empty and not required
	if (isFilterValueEmpty(value)) {
		return null;
	}

	// Text validations
	if (field.type === 'text' && typeof value === 'string') {
		if (rules.minLength && value.length < rules.minLength) {
			return VALIDATION_MESSAGES.MIN_LENGTH(rules.minLength);
		}
		if (rules.maxLength && value.length > rules.maxLength) {
			return VALIDATION_MESSAGES.MAX_LENGTH(rules.maxLength);
		}
		if (rules.pattern && !rules.pattern.test(value)) {
			return VALIDATION_MESSAGES.PATTERN;
		}
	}

	// Number validations
	if (field.type === 'number' && typeof value === 'number') {
		if (rules.min !== undefined && value < rules.min) {
			return VALIDATION_MESSAGES.MIN(rules.min);
		}
		if (rules.max !== undefined && value > rules.max) {
			return VALIDATION_MESSAGES.MAX(rules.max);
		}
	}

	// Number range validations
	if (field.type === 'number-range' && typeof value === 'object' && value) {
		const range = value as { min?: number; max?: number };

		if (rules.minRequired && range.min === undefined) {
			return VALIDATION_MESSAGES.MIN_REQUIRED;
		}

		if (rules.maxRequired && range.max === undefined) {
			return VALIDATION_MESSAGES.MAX_REQUIRED;
		}

		if (
			rules.minLessThanMax &&
			range.min !== undefined &&
			range.max !== undefined &&
			range.min >= range.max
		) {
			return VALIDATION_MESSAGES.MIN_LESS_THAN_MAX;
		}

		// Validate individual min/max against field constraints
		if (range.min !== undefined) {
			if (field.min !== undefined && range.min < field.min) {
				return VALIDATION_MESSAGES.MIN(field.min);
			}
			if (field.max !== undefined && range.min > field.max) {
				return VALIDATION_MESSAGES.MAX(field.max);
			}
		}

		if (range.max !== undefined) {
			if (field.min !== undefined && range.max < field.min) {
				return VALIDATION_MESSAGES.MIN(field.min);
			}
			if (field.max !== undefined && range.max > field.max) {
				return VALIDATION_MESSAGES.MAX(field.max);
			}
		}
	}

	// Array validations (multi-select, checkbox-group)
	if (Array.isArray(value)) {
		if (rules.minLength && value.length < rules.minLength) {
			return VALIDATION_MESSAGES.MIN_LENGTH(rules.minLength);
		}
		if (rules.maxLength && value.length > rules.maxLength) {
			return VALIDATION_MESSAGES.MAX_LENGTH(rules.maxLength);
		}
	}

	// Custom validation
	if (rules.custom) {
		const customError = rules.custom(value);
		if (customError) return customError;
	}

	return null;
}

/**
 * Validate all filter values against their schema
 */
export function validateAllFilters(
	schema: FilterSchema,
	values: FilterValues,
): FilterValidationErrors {
	const errors: FilterValidationErrors = {};

	for (const field of schema.fields) {
		const value = values[field.id];
		const error = validateFilterValue(field, value);
		if (error) {
			errors[field.id] = error;
		}
	}

	return errors;
}

/**
 * Validate a single field and return error
 */
export function validateField(
	schema: FilterSchema,
	fieldId: string,
	values: FilterValues,
): string | null {
	const field = schema.fields.find((f) => f.id === fieldId);
	if (!field) return null;

	const value = values[fieldId];
	return validateFilterValue(field, value);
}

/**
 * Check if there are any validation errors
 */
export function hasValidationErrors(errors: FilterValidationErrors): boolean {
	return Object.keys(errors).length > 0;
}

/**
 * Get validation error for a specific field
 */
export function getValidationError(
	errors: FilterValidationErrors,
	fieldId: string,
): string | undefined {
	return errors[fieldId];
}

/**
 * Create a validation rule helper
 */
export function createValidationRule(
	rule: Partial<FilterValidationRule>,
): FilterValidationRule {
	return {
		required: false,
		minLessThanMax: true,
		...rule,
	};
}

/**
 * Common validation patterns
 */
export const VALIDATION_PATTERNS = {
	EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
	URL: /^https?:\/\/.+/,
	PHONE: /^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/,
	ZIP_CODE: /^\d{5}(-\d{4})?$/,
	ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
	NUMERIC: /^\d+$/,
} as const;

/**
 * Common validation rule presets
 */
export const VALIDATION_PRESETS = {
	required: (): FilterValidationRule => ({
		required: true,
	}),

	email: (): FilterValidationRule => ({
		pattern: VALIDATION_PATTERNS.EMAIL,
	}),

	url: (): FilterValidationRule => ({
		pattern: VALIDATION_PATTERNS.URL,
	}),

	phone: (): FilterValidationRule => ({
		pattern: VALIDATION_PATTERNS.PHONE,
	}),

	positiveNumber: (): FilterValidationRule => ({
		min: 0,
	}),

	percentage: (): FilterValidationRule => ({
		min: 0,
		max: 100,
	}),

	range: (min: number, max: number): FilterValidationRule => ({
		minRequired: true,
		maxRequired: true,
		minLessThanMax: true,
		min,
		max,
	}),
} as const;
