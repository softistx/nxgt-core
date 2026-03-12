'use client';

import { CheckIcon, PlusIcon, StarIcon, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../../lib/utils';
import { Button } from '../buttons/button';
import { IconButton } from '../buttons/icon-button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '../dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '../dropdown-menu';
import { TextField } from '../text-field';
import type { FilterPresetsProps } from './types';

/**
 * FilterPresets - Preset management UI for filters
 */
export function FilterPresets({
	presets,
	currentPresetId,
	onLoad,
	onSave,
	onDelete,
	onSetDefault,
	maxPresets = 20,
	disabled = false,
	className,
}: FilterPresetsProps) {
	const [saveDialogOpen, setSaveDialogOpen] = useState(false);
	const [presetName, setPresetName] = useState('');
	const [presetDescription, setPresetDescription] = useState('');

	const canSave = presets.length < maxPresets;
	const currentPreset = presets.find((p) => p.id === currentPresetId);

	const handleSave = () => {
		if (!presetName.trim()) return;

		onSave(presetName.trim(), presetDescription.trim() || undefined);
		setPresetName('');
		setPresetDescription('');
		setSaveDialogOpen(false);
	};

	return (
		<div className={cn('flex items-center gap-2', className)}>
			{/* Preset Selector Dropdown */}
			{presets.length > 0 && (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outlined"
							disabled={disabled}
							className="min-w-[200px] justify-start"
						>
							{currentPreset ? (
								<>
									{currentPreset.icon}
									{currentPreset.name}
									{currentPreset.isDefault && (
										<StarIcon className="ml-auto size-4 fill-current" />
									)}
								</>
							) : (
								'Load Preset...'
							)}
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="w-[250px]">
						<DropdownMenuLabel>Saved Presets</DropdownMenuLabel>
						<DropdownMenuSeparator />
						{presets.map((preset) => (
							<DropdownMenuItem
								key={preset.id}
								onClick={() => onLoad(preset.id)}
								className="flex items-center justify-between"
							>
								<div className="flex items-center gap-2">
									{preset.icon}
									<div>
										<div className="font-medium">{preset.name}</div>
										{preset.description && (
											<div className="text-muted-foreground text-xs">
												{preset.description}
											</div>
										)}
									</div>
								</div>
								<div className="flex items-center gap-1">
									{preset.isDefault && (
										<StarIcon className="size-3 fill-current" />
									)}
									{preset.id === currentPresetId && (
										<CheckIcon className="size-3" />
									)}
								</div>
							</DropdownMenuItem>
						))}
						<DropdownMenuSeparator />
						<DropdownMenuLabel>Manage</DropdownMenuLabel>
						{presets.map((preset) => (
							<DropdownMenuItem
								key={`manage-${preset.id}`}
								className="flex items-center justify-between"
								onSelect={(e) => e.preventDefault()}
							>
								<span className="text-sm">{preset.name}</span>
								<div className="flex items-center gap-1">
									<IconButton
										variant="ghost"
										onClick={() =>
											onSetDefault(preset.isDefault ? null : preset.id)
										}
										title={
											preset.isDefault ? 'Unset default' : 'Set as default'
										}
										className="size-7 p-1"
									>
										<StarIcon
											className={cn(
												'size-3',
												preset.isDefault && 'fill-current',
											)}
										/>
									</IconButton>
									<IconButton
										variant="ghost"
										color="error"
										onClick={() => onDelete(preset.id)}
										title="Delete preset"
										className="size-7 p-1"
									>
										<TrashIcon className="size-3" />
									</IconButton>
								</div>
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			)}

			{/* Save New Preset */}
			<Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
				<DialogTrigger asChild>
					<IconButton
						variant="outlined"
						disabled={disabled || !canSave}
						title={
							canSave
								? 'Save current filters as preset'
								: `Maximum ${maxPresets} presets reached`
						}
					>
						<PlusIcon className="size-4" />
					</IconButton>
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Save Filter Preset</DialogTitle>
						<DialogDescription>
							Save your current filter configuration to quickly apply it later.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<TextField
							label="Preset Name"
							placeholder="e.g., Last Week Active"
							value={presetName}
							onChange={(e) => setPresetName(e.target.value)}
							required
							helperText={`${presets.length}/${maxPresets} presets used`}
						/>
						<TextField
							label="Description (optional)"
							placeholder="Brief description of this preset"
							value={presetDescription}
							onChange={(e) => setPresetDescription(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outlined">Cancel</Button>
						</DialogClose>
						<Button
							variant="filled"
							color="primary"
							onClick={handleSave}
							disabled={!presetName.trim()}
						>
							Save Preset
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
