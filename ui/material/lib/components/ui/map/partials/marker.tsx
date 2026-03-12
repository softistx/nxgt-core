'use client';

import {
	Marker as BaseMaker,
	type MarkerProps as BaseMarkerProps,
} from '@adamscybot/react-leaflet-component-marker';
import type { LatLng, LatLngExpression, Marker as MargerType } from 'leaflet';
import { MapPin } from 'lucide-react';
import {
	type ReactNode,
	useEffect,
	useEffectEvent,
	useMemo,
	useRef,
} from 'react';
import { useMapEvents } from 'react-leaflet';
import { IconButton, Tooltip } from '../../..';

export type MarkerProps = {
	onChange?: (position: LatLng) => void;
	popup?: ReactNode;
	tooltip?: ReactNode;
	reference?: boolean;
	icon?: BaseMarkerProps['icon'] | null;
} & Omit<BaseMarkerProps, 'icon'>;

export function Marker({
	position,
	onChange,
	draggable,
	children,
	tooltip,
	reference,
	icon,
	...props
}: MarkerProps) {
	const map = useMapEvents({
		viewreset() {
			if (reference) {
				onChange?.(map.getCenter());
			}
		},
	});
	const markerRef = useRef<MargerType>(null);
	const eventHandlers = useMemo(
		() => ({
			dragend() {
				const marker = markerRef.current;
				if (marker != null) {
					onChange?.(marker.getLatLng());
				}
			},
		}),
		[onChange],
	);

	const updateMapEvent = useEffectEvent((position: LatLngExpression) => {
		if (reference) {
			map.flyTo(position, map.getZoom());
		}
	});

	useEffect(() => {
		updateMapEvent(position);
	}, [position]);

	return (
		<BaseMaker
			{...props}
			draggable={draggable}
			eventHandlers={eventHandlers}
			position={position}
			ref={markerRef}
			icon={
				tooltip ? (
					<Tooltip content={tooltip}>
						{(icon as ReactNode) ?? (
							<IconButton color="error" variant={'tonal'}>
								<MapPin />
							</IconButton>
						)}
					</Tooltip>
				) : (
					(icon ?? (
						<IconButton color="error" variant={'tonal'}>
							<MapPin />
						</IconButton>
					))
				)
			}
		>
			{children}
		</BaseMaker>
	);
}
