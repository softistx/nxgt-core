import type { ReactNode } from 'react';

// ============================================================================
// Filter Types
// ============================================================================

/**
 * Available filter field types
 */
export type FilterType =
	| 'text'
	| 'number'
	| 'select'
	| 'multi-select'
	| 'date'
	| 'date-range'
	| 'number-range'
	| 'checkbox-group'
	| 'radio-group'
	| 'chips-multiple'
	| 'chips-single'
	| 'slider'
	| 'slider-range'
	| 'switch'
	| 'custom';

/**
 * Filter component layout variants
 */
export type FilterVariant =
	| 'inline'
	| 'dialog'
	| 'sheet'
	| 'drawer'
	| 'popover';

/**
 * Option for select, multi-select, checkbox-group, and radio-group filters
 */
export type FilterOption = {
	label: string;
	value: string | number;
	description?: string;
	icon?: ReactNode;
	disabled?: boolean;
};

/**
 * Filter field value types
 */
export type FilterValue =
	| string
	| number
	| boolean
	| string[]
	| number[]
	| { min?: number; max?: number }
	| { start?: Date | string; end?: Date | string }
	| Date
	| null
	| undefined;

/**
 * Record of filter values keyed by field ID
 */
export type FilterValues = Record<string, FilterValue>;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validation rule for a filter field
 */
export type FilterValidationRule = {
	required?: boolean;
	min?: number;
	max?: number;
	minLength?: number;
	maxLength?: number;
	pattern?: RegExp;
	custom?: (value: FilterValue) => string | null | undefined;
	// Range-specific
	minLessThanMax?: boolean;
	minRequired?: boolean;
	maxRequired?: boolean;
};

/**
 * Validation error for a filter field
 */
export type FilterValidationError = {
	field: string;
	message: string;
};

/**
 * Validation errors keyed by field ID
 */
export type FilterValidationErrors = Record<string, string>;

// ============================================================================
// Filter Field Schema
// ============================================================================

/**
 * Custom render function for filter fields
 */
export type FilterFieldRenderFunction = (props: {
	value: FilterValue;
	onChange: (value: FilterValue) => void;
	onBlur?: () => void;
	error?: string;
	disabled?: boolean;
}) => ReactNode;

/**
 * Filter field configuration
 */
export type FilterField = {
	id: string;
	type: FilterType;
	label: string;
	description?: string;
	placeholder?: string;
	icon?: ReactNode;
	defaultValue?: FilterValue;
	validation?: FilterValidationRule;
	disabled?: boolean;

	// Type-specific props
	// For select, multi-select, checkbox-group, radio-group
	options?: FilterOption[];

	// For number, number-range
	min?: number;
	max?: number;
	step?: number;

	// For text
	maxLength?: number;

	// For date, date-range
	minDate?: Date | string;
	maxDate?: Date | string;

	// For checkbox-group with many options
	collapsible?: boolean;
	defaultExpanded?: boolean;
	searchable?: boolean;

	// Custom render
	render?: FilterFieldRenderFunction;

	// Conditional visibility
	visibleWhen?: (values: FilterValues) => boolean;

	// Separator for visual grouping
	separator?: 'before' | 'after';
};

// ============================================================================
// Filter Grouping
// ============================================================================

/**
 * Filter group configuration
 */
export type FilterGroup = {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	collapsible?: boolean;
	defaultExpanded?: boolean;
	fields: string[]; // Array of filter field IDs
};

/**
 * Complete filter schema with fields and optional groups
 */
export type FilterSchema = {
	fields: FilterField[];
	groups?: FilterGroup[];
};

// ============================================================================
// Filter Persistence
// ============================================================================

/**
 * Storage strategy for filter persistence
 */
export type FilterPersistenceStrategy =
	| 'localStorage'
	| 'sessionStorage'
	| 'url'
	| 'custom';

/**
 * URL params configuration
 */
export type FilterUrlParamsConfig = {
	enabled: boolean;
	prefix?: string; // e.g., 'filter_' results in ?filter_category=electronics
	parseUrl?: (searchParams: URLSearchParams) => FilterValues;
	serializeUrl?: (values: FilterValues) => URLSearchParams;
};

/**
 * Custom storage implementation
 */
export type FilterCustomStorage = {
	save: (values: FilterValues) => void | Promise<void>;
	load: () => FilterValues | Promise<FilterValues> | null;
	clear: () => void | Promise<void>;
};

/**
 * Filter persistence configuration
 */
export type FilterPersistenceConfig = {
	enabled: boolean;
	strategy: FilterPersistenceStrategy;
	storageKey?: string; // For localStorage/sessionStorage
	version?: number; // Schema version for migration
	urlParams?: FilterUrlParamsConfig;
	customStorage?: FilterCustomStorage;
};

// ============================================================================
// Filter Presets
// ============================================================================

/**
 * Filter preset
 */
export type FilterPreset = {
	id: string;
	name: string;
	description?: string;
	icon?: ReactNode;
	values: FilterValues;
	isDefault?: boolean;
	createdAt: Date | string;
	updatedAt?: Date | string;
};

/**
 * Preset configuration
 */
export type FilterPresetConfig = {
	enabled: boolean;
	storage?: 'localStorage' | 'sessionStorage' | 'custom';
	storageKey?: string;
	maxPresets?: number; // Default: 20
	customStorage?: {
		save: (presets: FilterPreset[]) => void | Promise<void>;
		load: () => FilterPreset[] | Promise<FilterPreset[]> | null;
		clear: () => void | Promise<void>;
	};
};

// ============================================================================
// Filter State
// ============================================================================

/**
 * UI state for filter groups
 */
export type FilterGroupState = {
	expandedGroups: string[];
};

/**
 * Complete filter state managed by the slice
 */
export type FilterState = {
	// Current filter values (being edited)
	values: FilterValues;

	// Last applied filter values
	appliedValues: FilterValues;

	// Whether values differ from appliedValues
	isDirty: boolean;

	// Validation errors
	errors: FilterValidationErrors;

	// Whether the filter panel is open
	isOpen: boolean;

	// Group expand/collapse state
	groupState: FilterGroupState;

	// Presets
	presets: FilterPreset[];
	currentPresetId: string | null;

	// Metadata
	isValidating: boolean;
	isApplying: boolean;

	// Configuration state (passed as initial state)
	disabled: boolean;
	liveUpdate: boolean;
};

// ============================================================================
// Filter Actions
// ============================================================================

/**
 * Filter actions available to components
 */
export type FilterActions = {
	// Value management
	setValue: (field: string, value: FilterValue) => void;
	setValues: (values: FilterValues) => void;
	clearValue: (field: string) => void;
	clearAllValues: () => void;

	// Apply/Reset
	applyFilters: () => void;
	resetFilters: () => void;

	// Validation
	validateField: (field: string) => void;
	validateAll: () => boolean;
	clearError: (field: string) => void;
	clearAllErrors: () => void;

	// UI state
	toggleOpen: () => void;
	setOpen: (open: boolean) => void;

	// Groups
	toggleGroup: (groupId: string) => void;
	setGroupExpanded: (groupId: string, expanded: boolean) => void;

	// Presets
	savePreset: (name: string, description?: string) => void;
	loadPreset: (presetId: string) => void;
	deletePreset: (presetId: string) => void;
	updatePreset: (presetId: string, updates: Partial<FilterPreset>) => void;
	setDefaultPreset: (presetId: string | null) => void;

	// Persistence
	loadPersistedFilters: () => void;
	persistFilters: () => void;
	clearPersistedFilters: () => void;
};

// ============================================================================
// Filter Context
// ============================================================================

/**
 * Filter context value provided to child components
 */
export type FilterContextValue = {
	state: FilterState;
	actions: FilterActions;
	schema: FilterSchema;
	persistence?: FilterPersistenceConfig;
	presetConfig?: FilterPresetConfig;

	// Computed values
	activeFilterCount: number;
	hasActiveFilters: boolean;
	hasErrors: boolean;
	canApply: boolean;
	canReset: boolean;
};

// ============================================================================
// Component Props
// ============================================================================

/**
 * Base filter component props
 */
export type FilterBaseProps = {
	schema: FilterSchema;
	values?: FilterValues;
	defaultValues?: FilterValues;
	onChange?: (values: FilterValues) => void;
	onApply?: (values: FilterValues) => void;
	onReset?: () => void;
	persistence?: FilterPersistenceConfig;
	presetConfig?: FilterPresetConfig;
	disabled?: boolean;
	liveUpdate?: boolean; // Apply immediately without button
	className?: string;
};

/**
 * Filter trigger props
 */
export type FilterTriggerProps = {
	activeCount?: number;
	icon?: ReactNode;
	label?: string;
	showCount?: boolean;
	className?: string;
	variant?: 'filled' | 'outlined' | 'tonal' | 'ghost';
	color?: 'primary' | 'secondary' | 'default';
};

/**
 * Filter chips display props
 */
export type FilterChipsProps = {
	schema: FilterSchema;
	values: FilterValues;
	onRemove?: (field: string) => void;
	onClearAll?: () => void;
	maxVisible?: number; // Show only N chips, rest in "+X more"
	className?: string;
};

/**
 * Filter preset selector props
 */
export type FilterPresetsProps = {
	presets: FilterPreset[];
	currentPresetId: string | null;
	onLoad: (presetId: string) => void;
	onSave: (name: string, description?: string) => void;
	onDelete: (presetId: string) => void;
	onSetDefault: (presetId: string | null) => void;
	maxPresets?: number;
	disabled?: boolean;
	className?: string;
};
