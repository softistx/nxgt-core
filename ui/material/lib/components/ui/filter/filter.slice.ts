'use client';

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { DEFAULT_FILTER_STATE } from './consts';
import type {
	FilterPreset,
	FilterState,
	FilterValidationErrors,
	FilterValue,
	FilterValues,
} from './types';

export type FilterSliceState = FilterState;

const createInitialState = (
	overrides?: Partial<FilterSliceState>,
): FilterSliceState => ({
	...DEFAULT_FILTER_STATE,
	...overrides,
});

export const filterSlice = createSlice({
	name: 'filter',
	initialState: createInitialState(),
	reducers: {
		// ========================================================================
		// Value Management
		// ========================================================================

		/**
		 * Set a single filter value
		 */
		setValue: (
			state,
			action: PayloadAction<{ field: string; value: FilterValue }>,
		) => {
			const { field, value } = action.payload;
			state.values[field] = value;
			state.isDirty = true;
			// Clear error for this field when value changes
			delete state.errors[field];
		},

		/**
		 * Set multiple filter values
		 */
		setValues: (state, action: PayloadAction<FilterValues>) => {
			state.values = action.payload;
			state.isDirty = true;
			// Clear all errors
			state.errors = {};
		},

		/**
		 * Clear a single filter value
		 */
		clearValue: (state, action: PayloadAction<string>) => {
			const field = action.payload;
			delete state.values[field];
			delete state.errors[field];
			state.isDirty = true;
		},

		/**
		 * Clear all filter values
		 */
		clearAllValues: (state) => {
			state.values = {};
			state.errors = {};
			state.isDirty = true;
		},

		// ========================================================================
		// Apply/Reset
		// ========================================================================

		/**
		 * Apply current filter values (make them active)
		 */
		applyFilters: (state) => {
			state.isApplying = true;
			state.appliedValues = { ...state.values };
			state.isDirty = false;
			state.isApplying = false;
		},

		/**
		 * Reset filters to applied values
		 */
		resetToApplied: (state) => {
			state.values = { ...state.appliedValues };
			state.errors = {};
			state.isDirty = false;
		},

		/**
		 * Reset all filters (clear both current and applied)
		 */
		resetAll: (state) => {
			state.values = {};
			state.appliedValues = {};
			state.errors = {};
			state.isDirty = false;
			state.currentPresetId = null;
		},

		// ========================================================================
		// Validation
		// ========================================================================

		/**
		 * Set validation error for a field
		 */
		setError: (
			state,
			action: PayloadAction<{ field: string; message: string }>,
		) => {
			const { field, message } = action.payload;
			state.errors[field] = message;
		},

		/**
		 * Set multiple validation errors
		 */
		setErrors: (state, action: PayloadAction<FilterValidationErrors>) => {
			state.errors = action.payload;
		},

		/**
		 * Clear error for a field
		 */
		clearError: (state, action: PayloadAction<string>) => {
			const field = action.payload;
			delete state.errors[field];
		},

		/**
		 * Clear all validation errors
		 */
		clearAllErrors: (state) => {
			state.errors = {};
		},

		/**
		 * Set validating state
		 */
		setValidating: (state, action: PayloadAction<boolean>) => {
			state.isValidating = action.payload;
		},

		// ========================================================================
		// UI State
		// ========================================================================

		/**
		 * Toggle filter panel open/closed
		 */
		toggleOpen: (state) => {
			state.isOpen = !state.isOpen;
		},

		/**
		 * Set filter panel open state
		 */
		setOpen: (state, action: PayloadAction<boolean>) => {
			state.isOpen = action.payload;
		},

		// ========================================================================
		// Groups
		// ========================================================================

		/**
		 * Toggle group expanded/collapsed
		 */
		toggleGroup: (state, action: PayloadAction<string>) => {
			const groupId = action.payload;
			const index = state.groupState.expandedGroups.indexOf(groupId);
			if (index > -1) {
				state.groupState.expandedGroups.splice(index, 1);
			} else {
				state.groupState.expandedGroups.push(groupId);
			}
		},

		/**
		 * Set group expanded state
		 */
		setGroupExpanded: (
			state,
			action: PayloadAction<{ groupId: string; expanded: boolean }>,
		) => {
			const { groupId, expanded } = action.payload;
			const index = state.groupState.expandedGroups.indexOf(groupId);
			if (expanded && index === -1) {
				state.groupState.expandedGroups.push(groupId);
			} else if (!expanded && index > -1) {
				state.groupState.expandedGroups.splice(index, 1);
			}
		},

		/**
		 * Initialize group states based on schema
		 */
		initializeGroupStates: (state, action: PayloadAction<string[]>) => {
			state.groupState.expandedGroups = action.payload;
		},

		// ========================================================================
		// Presets
		// ========================================================================

		/**
		 * Add a new preset
		 */
		addPreset: (state, action: PayloadAction<FilterPreset>) => {
			state.presets.push(action.payload);
			state.currentPresetId = action.payload.id;
		},

		/**
		 * Update an existing preset
		 */
		updatePreset: (
			state,
			action: PayloadAction<{ id: string; updates: Partial<FilterPreset> }>,
		) => {
			const { id, updates } = action.payload;
			const index = state.presets.findIndex((p) => p.id === id);
			if (index > -1) {
				state.presets[index] = { ...state.presets[index], ...updates };
			}
		},

		/**
		 * Delete a preset
		 */
		deletePreset: (state, action: PayloadAction<string>) => {
			const id = action.payload;
			state.presets = state.presets.filter((p) => p.id !== id);
			if (state.currentPresetId === id) {
				state.currentPresetId = null;
			}
		},

		/**
		 * Load a preset (apply its values)
		 */
		loadPreset: (state, action: PayloadAction<string>) => {
			const id = action.payload;
			const preset = state.presets.find((p) => p.id === id);
			if (preset) {
				state.values = { ...preset.values };
				state.currentPresetId = id;
				state.isDirty = true;
			}
		},

		/**
		 * Set default preset
		 */
		setDefaultPreset: (state, action: PayloadAction<string | null>) => {
			const id = action.payload;
			// Clear existing default
			for (const preset of state.presets) {
				preset.isDefault = false;
			}
			// Set new default
			if (id) {
				const preset = state.presets.find((p) => p.id === id);
				if (preset) {
					preset.isDefault = true;
				}
			}
		},

		/**
		 * Set all presets
		 */
		setPresets: (state, action: PayloadAction<FilterPreset[]>) => {
			state.presets = action.payload;
		},

		/**
		 * Clear current preset ID (after modifying a loaded preset)
		 */
		clearCurrentPreset: (state) => {
			state.currentPresetId = null;
		},

		// ========================================================================
		// Persistence
		// ========================================================================

		/**
		 * Load persisted values
		 */
		loadPersistedValues: (state, action: PayloadAction<FilterValues>) => {
			state.values = action.payload;
			state.appliedValues = { ...action.payload };
			state.isDirty = false;
		},

		// ========================================================================
		// Configuration
		// ========================================================================

		/**
		 * Set disabled state
		 */
		setDisabled: (state, action: PayloadAction<boolean>) => {
			state.disabled = action.payload;
		},

		/**
		 * Set live update mode
		 */
		setLiveUpdate: (state, action: PayloadAction<boolean>) => {
			state.liveUpdate = action.payload;
		},

		// ========================================================================
		// Reset State
		// ========================================================================

		/**
		 * Reset entire state with optional overrides
		 */
		resetState: (
			_state,
			action: PayloadAction<Partial<FilterSliceState> | undefined>,
		) => {
			return createInitialState(action.payload);
		},
	},
});

// ============================================================================
// Selectors
// ============================================================================

import {
	countActiveFilters,
	hasActiveFilters as hasActiveFiltersUtil,
} from './filter.utils';
import { hasValidationErrors } from './filter-validation.utils';

export const filterSelectors = {
	/**
	 * Get active filter count
	 */
	selectActiveFilterCount: (state: FilterSliceState): number =>
		countActiveFilters(state.appliedValues),

	/**
	 * Check if there are any active filters
	 */
	selectHasActiveFilters: (state: FilterSliceState): boolean =>
		hasActiveFiltersUtil(state.appliedValues),

	/**
	 * Check if there are validation errors
	 */
	selectHasErrors: (state: FilterSliceState): boolean =>
		hasValidationErrors(state.errors),

	/**
	 * Check if apply button should be enabled
	 */
	selectCanApply: (state: FilterSliceState): boolean =>
		!state.disabled && state.isDirty && !hasValidationErrors(state.errors),

	/**
	 * Check if reset button should be enabled
	 */
	selectCanReset: (state: FilterSliceState): boolean =>
		!state.disabled && hasActiveFiltersUtil(state.appliedValues),

	/**
	 * Check if component is disabled
	 */
	selectIsDisabled: (state: FilterSliceState): boolean => state.disabled,

	/**
	 * Check if live update mode is enabled
	 */
	selectIsLiveUpdate: (state: FilterSliceState): boolean => state.liveUpdate,

	/**
	 * Get current preset
	 */
	selectCurrentPreset: (state: FilterSliceState): FilterPreset | null =>
		state.presets.find((p) => p.id === state.currentPresetId) || null,

	/**
	 * Get default preset
	 */
	selectDefaultPreset: (state: FilterSliceState): FilterPreset | null =>
		state.presets.find((p) => p.isDefault) || null,
};

export const filterActions = filterSlice.actions;
export const filterReducer = filterSlice.reducer;
