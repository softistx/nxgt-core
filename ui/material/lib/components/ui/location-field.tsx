import type { LatLng } from 'leaflet';
import { MapPin } from 'lucide-react';
import { type ReactNode, useCallback, useState } from 'react';
import { Button } from './buttons/button';
import { IconButton } from './buttons/icon-button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogTitle,
	DialogTrigger,
} from './dialog';
import { LocationPreview, Map as MapComponent, Marker } from './map';
import { TextField, type TextFieldProps } from './text-field';

export type LocationFieldProps = {
	value?: [number, number] | null;
	onChange?: (value: [number, number]) => void;
	dialogTitle?: ReactNode;
} & Omit<TextFieldProps, 'value' | 'onChange'>;

export function LocationField({
	value,
	onChange,
	dialogTitle,
	...props
}: LocationFieldProps) {
	const handleChange = useCallback(
		(value: LatLng) => {
			onChange?.([
				parseFloat(value.lat.toFixed(7)),
				parseFloat(value.lng.toFixed(7)),
			]);
		},
		[onChange],
	);

	const [open, setOpen] = useState(false);

	const handleClose = useCallback(() => {
		setOpen(false);
	}, []);

	return (
		<TextField
			{...props}
			value={value ? value.join(' - ') : ''}
			leading={
				<LocationPreview position={value ?? [5.44087, 10.06843]}>
					{props.leading}
				</LocationPreview>
			}
			trailing={
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						{props.trailing ?? (
							<IconButton data-pw={`${props.name}-trailing`} variant={'tonal'}>
								<MapPin />
							</IconButton>
						)}
					</DialogTrigger>
					<DialogContent>
						<DialogClose />
						<DialogTitle>{dialogTitle ?? 'Choose a location'}</DialogTitle>
						<DialogDescription hidden></DialogDescription>
						<MapComponent center={value ?? [5.44087, 10.06843]}>
							<Marker
								position={value ?? [5.44087, 10.06843]}
								onChange={handleChange}
								draggable={!props.disabled && !props.readOnly}
								reference={!props.disabled && !props.readOnly}
							/>
						</MapComponent>
						<DialogFooter>
							<Button onClick={handleClose}>Close</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			}
		/>
	);
}
