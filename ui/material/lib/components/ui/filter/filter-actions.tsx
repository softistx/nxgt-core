'use client';

import { cn } from '../../../lib/utils';
import { Button } from '../buttons/button';
import { useFilterContext } from './filter-context';
import { FilterPresets } from './filter-presets';

export type FilterActionsProps = {
	className?: string;
	showReset?: boolean;
	showPresets?: boolean;
	applyLabel?: string;
	resetLabel?: string;
};

/**
 * FilterActions - Apply and Reset buttons for filters with optional preset management
 */
export function FilterActions({
	className,
	showReset = true,
	showPresets = true,
	applyLabel = 'Apply Filters',
	resetLabel = 'Reset',
}: FilterActionsProps) {
	const { state, actions, canApply, canReset, presetConfig } =
		useFilterContext();

	const presetsEnabled = presetConfig?.enabled && showPresets;

	return (
		<div className={cn('flex flex-col gap-4 w-full @container', className)}>
			{/* Preset Management (if enabled) */}
			{presetsEnabled && (
				<FilterPresets
					presets={state.presets}
					currentPresetId={state.currentPresetId}
					onLoad={actions.loadPreset}
					onSave={actions.savePreset}
					onDelete={actions.deletePreset}
					onSetDefault={actions.setDefaultPreset}
					maxPresets={presetConfig?.maxPresets}
				/>
			)}

			{/* Apply/Reset Actions */}
			<div className="flex gap-2 *:flex-1 @sm:*:flex-none justify-end w-full">
				{showReset && (
					<Button
						type="button"
						variant="tonal"
						onClick={actions.resetFilters}
						disabled={!canReset}
					>
						{resetLabel}
					</Button>
				)}
				<Button
					type="button"
					variant="filled"
					color="primary"
					onClick={actions.applyFilters}
					disabled={!canApply}
				>
					{applyLabel}
					{state.isDirty && ' *'}
				</Button>
			</div>
		</div>
	);
}
