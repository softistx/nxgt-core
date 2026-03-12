'use client';

import { Minus, Plus } from 'lucide-react';
import { type ComponentProps, useCallback, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { IconButton } from '../../..';
import { useGeolocation } from '../../../../hooks';
import { cn } from '../../../../lib/utils';
import { POSITION_CLASSES } from '../consts';

export type MapActionsProps = {
	position?: keyof typeof POSITION_CLASSES;
} & ComponentProps<'div'>;

export function MapActions({
	position = 'topleft',
	className,
	...props
}: MapActionsProps) {
	const map = useMap();
	const { coords } = useGeolocation();

	const handleZoomIn = useCallback(() => {
		map.setView(map.getCenter(), map.getZoom() + 1, { animate: true });
	}, [map]);
	const handleZoomOut = useCallback(() => {
		map.setView(map.getCenter(), Math.max(map.getZoom() - 1, 0), {
			animate: true,
		});
	}, [map]);

	useEffect(() => {
		if (coords) {
			map.setView([coords.latitude, coords.longitude], map.getZoom());
		}
	}, [coords, map]);

	return (
		<div className={cn(POSITION_CLASSES[position], 'border-primary')}>
			<div className="leaflet-control leaflet-bar border-primary">
				<div
					className={cn(
						'grid gap-1 p-0.5 bg-paper rounded *:z-[300]',
						className,
					)}
					{...props}
				>
					<IconButton onClick={handleZoomIn}>
						<Plus />
					</IconButton>
					<IconButton disabled={map.getZoom() === 0} onClick={handleZoomOut}>
						<Minus />
					</IconButton>
				</div>
			</div>
		</div>
	);
}
