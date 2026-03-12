import { Activity } from 'react';
import {
	MapContainer,
	type MapContainerProps,
	TileLayer,
	ZoomControl,
} from 'react-leaflet';
import { useGeolocation } from '../../../hooks';
import { cn } from '../../../lib/utils';
import { MinimapControl } from './partials';

export type MapProps = { showMinicardControl?: boolean } & MapContainerProps;

export function MapComponent({
	className,
	children,
	showMinicardControl = true,
	zoom = 13,
	zoomControl = false,
	scrollWheelZoom = false,
	...props
}: MapProps) {
	const { coords } = useGeolocation();

	return (
		<MapContainer
			{...props}
			center={
				props.center ?? [
					coords?.latitude ?? 5.44087,
					coords?.longitude ?? 10.06843,
				]
			}
			zoomControl={zoomControl}
			zoom={zoom}
			scrollWheelZoom={scrollWheelZoom}
			className={cn('w-full h-[348px] ring-1 ring-primary rounded', className)}
		>
			<TileLayer
				attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
				url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
			/>
			<Activity mode={showMinicardControl ? 'visible' : 'hidden'}>
				<MinimapControl position="topright" zoom={6} />
			</Activity>
			<ZoomControl position="topleft" />
			{children}
		</MapContainer>
	);
}

export { MapComponent as Map };
