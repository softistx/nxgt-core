'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSliceReducer } from '../../../lib/redux/use-slice-reducer';
import { DEFAULT_PERSISTENCE_CONFIG, DEFAULT_PRESET_CONFIG } from './consts';
import { filterSelectors, filterSlice } from './filter.slice';
import {
	cleanFilterValues,
	generatePresetId,
	getDefaultValuesFromSchema,
	haveFiltersChanged,
	sortPresets,
} from './filter.utils';
import {
	clearPersistedFilterValues,
	loadPersistedFilterValues,
	loadPresets,
	persistFilterValues,
	savePresets,
} from './filter-persistence.utils';
import {
	hasValidationErrors,
	validateAllFilters,
	validateField,
} from './filter-validation.utils';
import type {
	FilterActions,
	FilterPersistenceConfig,
	FilterPreset,
	FilterPresetConfig,
	FilterSchema,
	FilterValues,
} from './types';
import { useFilterSelector } from './use-filter-selector';

export type UseFilterOptions = {
	schema: FilterSchema;
	values?: FilterValues;
	defaultValues?: FilterValues;
	onChange?: (values: FilterValues) => void;
	onApply?: (values: FilterValues) => void;
	onReset?: () => void;
	persistence?: FilterPersistenceConfig;
	presetConfig?: FilterPresetConfig;
	liveUpdate?: boolean;
	disabled?: boolean;
};

export function useFilter(options: UseFilterOptions) {
	const {
		schema,
		values: controlledValues,
		defaultValues: defaultValuesProp,
		onChange,
		onApply,
		onReset,
		persistence: persistenceConfig,
		presetConfig,
		liveUpdate = false,
		disabled = false,
	} = options;

	// Merge configs with defaults
	const persistence = useMemo(
		() => ({ ...DEFAULT_PERSISTENCE_CONFIG, ...persistenceConfig }),
		[persistenceConfig],
	);

	const presets = useMemo(
		() => ({ ...DEFAULT_PRESET_CONFIG, ...presetConfig }),
		[presetConfig],
	);

	// Use Redux slice with useSliceReducer
	const [state, actions] = useSliceReducer(filterSlice);

	// Track initialization and controlled mode
	const isControlled = controlledValues !== undefined;
	const isInitializedRef = useRef(false);
	const persistenceLoadedRef = useRef(false);
	const isFirstRenderRef = useRef(true);

	// Get schema default values
	const schemaDefaults = useMemo(
		() => getDefaultValuesFromSchema(schema),
		[schema],
	);

	// Merge all default values
	const defaultValues = useMemo(
		() => ({ ...schemaDefaults, ...defaultValuesProp }),
		[schemaDefaults, defaultValuesProp],
	);

	// ========================================================================
	// Sync disabled and liveUpdate to State
	// ========================================================================

	// biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount for initial sync
	useEffect(() => {
		if (isFirstRenderRef.current) {
			isFirstRenderRef.current = false;
			// Set initial values
			actions.setDisabled(disabled);
			actions.setLiveUpdate(liveUpdate);
		}
	}, []);

	// Update when props change
	useEffect(() => {
		if (!isFirstRenderRef.current && state.disabled !== disabled) {
			actions.setDisabled(disabled);
		}
	}, [disabled, state.disabled, actions]);

	useEffect(() => {
		if (!isFirstRenderRef.current && state.liveUpdate !== liveUpdate) {
			actions.setLiveUpdate(liveUpdate);
		}
	}, [liveUpdate, state.liveUpdate, actions]);

	// ========================================================================
	// Initialization on Mount
	// ========================================================================

	// biome-ignore lint/correctness/useExhaustiveDependencies: only run on mount
	useEffect(() => {
		if (isInitializedRef.current) return;
		isInitializedRef.current = true;

		// Initialize group states
		const expandedGroups =
			schema.groups
				?.filter((g) => g.defaultExpanded !== false)
				.map((g) => g.id) || [];
		actions.initializeGroupStates(expandedGroups);

		// Load persisted values
		if (persistence.enabled && !persistenceLoadedRef.current) {
			persistenceLoadedRef.current = true;
			loadPersistedFilterValues(persistence, schema).then((persisted) => {
				if (persisted && Object.keys(persisted).length > 0) {
					// Validate persisted values against schema
					const errors = validateAllFilters(schema, persisted);
					if (!hasValidationErrors(errors)) {
						actions.loadPersistedValues(persisted);
						return;
					}
				}

				// If no valid persisted values, use defaults
				if (Object.keys(defaultValues).length > 0) {
					actions.setValues(defaultValues);
					actions.applyFilters();
				}
			});
		} else if (Object.keys(defaultValues).length > 0) {
			// No persistence, just use defaults
			actions.setValues(defaultValues);
			actions.applyFilters();
		}

		// Load presets if enabled
		if (presets.enabled && presets.storage !== 'custom') {
			const loaded = loadPresets(
				presets.storage || 'localStorage',
				presets.storageKey || 'filter-presets',
			);
			if (loaded && loaded.length > 0) {
				actions.setPresets(sortPresets(loaded));

				// Auto-load default preset
				const defaultPreset = loaded.find((p) => p.isDefault);
				if (defaultPreset) {
					actions.loadPreset(defaultPreset.id);
					actions.applyFilters();
				}
			}
		}
	}, []);

	// ========================================================================
	// Sync Controlled Values to State
	// ========================================================================

	// Track the last values we sent via onChange to avoid sync loops
	const lastSentValuesRef = useRef<FilterValues>({});

	// biome-ignore lint/correctness/useExhaustiveDependencies: We intentionally exclude state.values to avoid loops
	useEffect(() => {
		if (isControlled && controlledValues) {
			// Only sync if controlled values differ from both:
			// 1. Current internal state (in case parent made independent changes)
			// 2. Last values we sent via onChange (to avoid echoing back our own changes)
			if (
				haveFiltersChanged(state.values, controlledValues) &&
				haveFiltersChanged(lastSentValuesRef.current, controlledValues)
			) {
				actions.setValues(controlledValues);
			}
		}
	}, [isControlled, controlledValues, actions]);

	// ========================================================================
	// React to State Changes
	// ========================================================================

	// Previous state ref to detect changes
	const prevStateRef = useRef(state);

	useEffect(() => {
		const prevState = prevStateRef.current;
		prevStateRef.current = state;

		// React to value changes
		if (prevState.values !== state.values) {
			// Notify onChange for controlled mode
			if (isControlled && onChange) {
				const cleaned = cleanFilterValues(state.values);
				lastSentValuesRef.current = cleaned;
				onChange(cleaned);
			}

			// Live update mode - auto validate and apply
			if (state.liveUpdate && !state.disabled) {
				const errors = validateAllFilters(schema, state.values);
				if (!hasValidationErrors(errors)) {
					actions.setErrors(errors);
					actions.applyFilters();
				} else {
					actions.setErrors(errors);
				}
			}
		}

		// React to applied values changes
		if (prevState.appliedValues !== state.appliedValues) {
			const cleaned = cleanFilterValues(state.appliedValues);

			// Persist if enabled
			if (persistence.enabled) {
				persistFilterValues(persistence, schema, cleaned);
			}

			// Notify onApply callback
			if (onApply) {
				onApply(cleaned);
			}

			// Check if we need to clear current preset
			if (state.currentPresetId) {
				const currentPreset = state.presets.find(
					(p) => p.id === state.currentPresetId,
				);
				if (
					currentPreset &&
					haveFiltersChanged(currentPreset.values, state.appliedValues)
				) {
					actions.clearCurrentPreset();
				}
			}
		}

		// React to preset changes (save to storage)
		if (prevState.presets !== state.presets) {
			if (presets.enabled && presets.storage !== 'custom') {
				savePresets(
					presets.storage || 'localStorage',
					presets.storageKey || 'filter-presets',
					state.presets,
				);
			}
		}
	}, [
		state,
		isControlled,
		onChange,
		onApply,
		schema,
		persistence,
		presets,
		actions,
	]);

	// ========================================================================
	// Enhanced Actions (thin wrappers for validation & side effects)
	// ========================================================================

	const enhancedActions: FilterActions = useMemo(
		() => ({
			// Value management - pass through with guard
			setValue: (field, value) => {
				if (state.disabled) return;
				actions.setValue({ field, value });
			},

			setValues: (values: FilterValues) => {
				if (state.disabled) return;
				actions.setValues(values);
			},

			clearValue: (field: string) => {
				if (state.disabled) return;
				actions.clearValue(field);
			},

			clearAllValues: () => {
				if (state.disabled) return;
				actions.clearAllValues();
			},

			// Apply/Reset with validation
			applyFilters: () => {
				if (state.disabled) return;

				// Validate all before applying
				const errors = validateAllFilters(schema, state.values);
				actions.setErrors(errors);

				if (hasValidationErrors(errors)) {
					return;
				}

				actions.applyFilters();
			},

			resetFilters: () => {
				if (state.disabled) return;

				actions.resetAll();

				if (onReset) {
					onReset();
				}

				// Clear persistence
				if (persistence.enabled) {
					clearPersistedFilterValues(persistence);
				}
			},

			// Validation actions
			validateField: (field: string) => {
				const error = validateField(schema, field, state.values);
				if (error) {
					actions.setError({ field, message: error });
				} else {
					actions.clearError(field);
				}
			},

			validateAll: (): boolean => {
				const errors = validateAllFilters(schema, state.values);
				actions.setErrors(errors);
				return !hasValidationErrors(errors);
			},

			clearError: (field: string) => {
				actions.clearError(field);
			},

			clearAllErrors: () => {
				actions.clearAllErrors();
			},

			// UI state - direct pass through
			toggleOpen: () => {
				actions.toggleOpen();
			},

			setOpen: (open: boolean) => {
				actions.setOpen(open);
			},

			// Groups - direct pass through
			toggleGroup: (groupId: string) => {
				actions.toggleGroup(groupId);
			},

			setGroupExpanded: (groupId: string, expanded: boolean) => {
				actions.setGroupExpanded({ groupId, expanded });
			},

			// Presets with storage & validation
			savePreset: (name: string, description?: string) => {
				if (state.disabled) return;

				// Check max presets limit
				if (presets.maxPresets && state.presets.length >= presets.maxPresets) {
					console.warn(
						`Maximum number of presets (${presets.maxPresets}) reached`,
					);
					return;
				}

				const preset: FilterPreset = {
					id: generatePresetId(),
					name,
					description,
					values: { ...state.values },
					createdAt: new Date(),
				};

				actions.addPreset(preset);
				// Note: Preset saving to storage is handled by the effect above
			},

			loadPreset: (presetId: string) => {
				if (state.disabled) return;
				actions.loadPreset(presetId);
			},

			deletePreset: (presetId: string) => {
				if (state.disabled) return;
				actions.deletePreset(presetId);
				// Note: Storage update is handled by the effect above
			},

			updatePreset: (presetId: string, updates: Partial<FilterPreset>) => {
				if (state.disabled) return;

				const updatedData = {
					...updates,
					updatedAt: new Date(),
				};

				actions.updatePreset({ id: presetId, updates: updatedData });
				// Note: Storage update is handled by the effect above
			},

			setDefaultPreset: (presetId: string | null) => {
				if (state.disabled) return;
				actions.setDefaultPreset(presetId);
				// Note: Storage update is handled by the effect above
			},

			// Persistence actions
			loadPersistedFilters: async () => {
				const persisted = await loadPersistedFilterValues(persistence, schema);
				if (persisted) {
					actions.loadPersistedValues(persisted);
				}
			},

			persistFilters: async () => {
				await persistFilterValues(persistence, schema, state.appliedValues);
			},

			clearPersistedFilters: async () => {
				await clearPersistedFilterValues(persistence);
			},
		}),
		[state, schema, actions, persistence, presets, onReset],
	);

	// ========================================================================
	// Computed Values (using selectors from slice)
	// ========================================================================

	const activeFilterCount = useFilterSelector(
		state,
		filterSelectors.selectActiveFilterCount,
	);

	const hasActiveFiltersValue = useFilterSelector(
		state,
		filterSelectors.selectHasActiveFilters,
	);

	const hasErrors = useFilterSelector(state, filterSelectors.selectHasErrors);

	const canApply = useFilterSelector(state, filterSelectors.selectCanApply);

	const canReset = useFilterSelector(state, filterSelectors.selectCanReset);

	return {
		state,
		actions: enhancedActions,
		schema,
		persistence,
		presetConfig: presets,
		activeFilterCount,
		hasActiveFilters: hasActiveFiltersValue,
		hasErrors,
		canApply,
		canReset,
	};
}
