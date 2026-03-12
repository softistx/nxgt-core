import type {
	FilterPersistenceConfig,
	FilterPresetConfig,
	FilterState,
	FilterValidationRule,
} from './types';

/**
 * Default validation rules
 */
export const DEFAULT_VALIDATION_RULES: FilterValidationRule = {
	required: false,
	minLessThanMax: true,
};

/**
 * Default persistence configuration
 */
export const DEFAULT_PERSISTENCE_CONFIG: FilterPersistenceConfig = {
	enabled: false,
	strategy: 'localStorage',
	storageKey: 'filter-values',
	version: 1,
	urlParams: {
		enabled: false,
		prefix: 'f_',
	},
};

/**
 * Default preset configuration
 */
export const DEFAULT_PRESET_CONFIG: FilterPresetConfig = {
	enabled: false,
	storage: 'localStorage',
	storageKey: 'filter-presets',
	maxPresets: 20,
};

/**
 * Default filter state
 */
export const DEFAULT_FILTER_STATE: FilterState = {
	values: {},
	appliedValues: {},
	isDirty: false,
	errors: {},
	isOpen: false,
	groupState: {
		expandedGroups: [],
	},
	presets: [],
	currentPresetId: null,
	isValidating: false,
	isApplying: false,
	disabled: false,
	liveUpdate: false,
};

/**
 * Error messages
 */
export const VALIDATION_MESSAGES = {
	REQUIRED: 'This field is required',
	MIN: (min: number) => `Minimum value is ${min}`,
	MAX: (max: number) => `Maximum value is ${max}`,
	MIN_LENGTH: (minLength: number) => `Minimum length is ${minLength}`,
	MAX_LENGTH: (maxLength: number) => `Maximum length is ${maxLength}`,
	PATTERN: 'Invalid format',
	MIN_LESS_THAN_MAX: 'Minimum must be less than maximum',
	MIN_REQUIRED: 'Minimum value is required',
	MAX_REQUIRED: 'Maximum value is required',
} as const;

/**
 * URL param encoding separators
 */
export const URL_PARAM_SEPARATORS = {
	ARRAY: ',', // For arrays: nike,adidas,puma
	RANGE: '-', // For ranges: 100-500
	DATE_RANGE: '_', // For date ranges: 2024-01-01_2024-12-31
} as const;

/**
 * Maximum number of filter chips to show before "+N more"
 */
export const DEFAULT_MAX_VISIBLE_CHIPS = 5;

/**
 * Filter container query breakpoints (in pixels)
 */
export const FILTER_CONTAINER_BREAKPOINTS = {
	SM: 384, // 2 columns
	MD: 512, // 3 columns
	LG: 672, // 4 columns
} as const;
