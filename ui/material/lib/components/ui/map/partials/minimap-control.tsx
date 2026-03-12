'use client';

import { useEventHandlers, useLeafletContext } from '@react-leaflet/core';
import type { LeafletMouseEvent, Map as MapType } from 'leaflet';
import { useCallback, useMemo, useState } from 'react';
import {
	MapContainer,
	Rectangle,
	TileLayer,
	useMap,
	useMapEvent,
} from 'react-leaflet';
import { cn } from '../../../../lib/utils';
import { POSITION_CLASSES } from '../consts';

const BOUNDS_STYLE = { weight: 1 };

function MinimapBounds({
	parentMap,
	zoom,
}: {
	parentMap: MapType;
	zoom: number;
}) {
	const minimap = useMap();

	const onClick = useCallback(
		(e: LeafletMouseEvent) => {
			parentMap.setView(e.latlng, parentMap.getZoom());
		},
		[parentMap],
	);
	useMapEvent('click', onClick);

	const context = useLeafletContext();

	// Keep track of bounds in state to trigger renders
	const [bounds, setBounds] = useState(parentMap.getBounds());
	const onChange = useCallback(() => {
		setBounds(parentMap.getBounds());
		// Update the minimap's view to match the parent map's center and zoom
		minimap.setView(parentMap.getCenter(), zoom);
	}, [minimap, parentMap, zoom]);

	// Listen to events on the parent map
	const handlers = useMemo(
		() => ({ move: onChange, zoom: onChange }),
		[onChange],
	);
	useEventHandlers({ instance: parentMap, context }, handlers);

	return <Rectangle bounds={bounds} pathOptions={BOUNDS_STYLE} />;
}

export function MinimapControl({
	position,
	zoom,
}: {
	position?: keyof typeof POSITION_CLASSES;
	zoom?: number;
}) {
	const parentMap = useMap();
	const mapZoom = zoom || 0;

	// Memoize the minimap so it's not affected by position changes
	const minimap = useMemo(
		() => (
			<MapContainer
				className={cn(
					'size-24 ring-1 ring-error border-none rounded-xs hover:shadow p-0.5 bg-background',
					'cursor-pointer',
				)}
				center={parentMap.getCenter()}
				zoom={mapZoom}
				dragging={false}
				doubleClickZoom={false}
				scrollWheelZoom={false}
				attributionControl={false}
				zoomControl={false}
			>
				<TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
				<MinimapBounds parentMap={parentMap} zoom={mapZoom} />
			</MapContainer>
		),
		[parentMap, mapZoom],
	);

	const positionClass =
		(position && POSITION_CLASSES[position]) || POSITION_CLASSES.topright;
	return (
		<div className={positionClass}>
			<div className="leaflet-control leaflet-bar">{minimap}</div>
		</div>
	);
}
