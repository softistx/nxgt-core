'use client';

import type { LatLngExpression } from 'leaflet';
import { MapIcon } from 'lucide-react';
import { type PropsWithChildren, useState } from 'react';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
	IconButton,
} from '../../..';
import { MapComponent } from '../map';
import { Marker } from './marker';

export type LocationPreviewProps = {
	position: LatLngExpression;
	name?: string;
} & PropsWithChildren;

export function LocationPreview({
	name,
	position,
	children,
}: LocationPreviewProps) {
	'use no memo';

	const [open, setOpen] = useState(false);

	return (
		<HoverCard open={open} onOpenChange={setOpen}>
			<HoverCardTrigger asChild>
				{children ?? (
					<IconButton
						variant={'tonal'}
						data-pw={`${name ?? 'location'}-preview`}
						color="info"
					>
						<MapIcon />
					</IconButton>
				)}
			</HoverCardTrigger>
			<HoverCardContent>
				<MapComponent center={position} showMinicardControl={false}>
					<Marker position={position} />
				</MapComponent>
			</HoverCardContent>
		</HoverCard>
	);
}
