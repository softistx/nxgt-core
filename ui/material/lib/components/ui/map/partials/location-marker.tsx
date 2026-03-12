'use client';

import { MapPin } from 'lucide-react';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { IconButton } from '../../..';
import { useGeolocation } from '../../../../hooks';
import { Marker, type MarkerProps } from './marker';

export type LocationMarkerProps = {
	icon?: MarkerProps['icon'];
} & Omit<MarkerProps, 'position' | 'draggable' | 'icon' | 'onChange'>;

export function LocationMarker({ ...props }: LocationMarkerProps) {
	const { coords } = useGeolocation();

	const map = useMap();

	useEffect(() => {
		if (coords) {
			map.flyTo([coords.latitude, coords.longitude], map.getZoom());
		}
	}, [coords, map.flyTo, map.getZoom]);

	return coords ? (
		<Marker
			{...props}
			tooltip="You are here"
			icon={
				props.icon ?? (
					<IconButton color="error">
						<MapPin />
					</IconButton>
				)
			}
			position={[coords.latitude, coords.longitude]}
			draggable
		/>
	) : null;
}
