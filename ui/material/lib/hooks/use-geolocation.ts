import { type GeolocatedConfig, useGeolocated } from 'react-geolocated';

export function useGeolocation(options: GeolocatedConfig = {}) {
	const result = useGeolocated({
		...options,
		positionOptions: options.positionOptions ?? {
			enableHighAccuracy: false,
		},
		userDecisionTimeout: options.userDecisionTimeout ?? 5000,
	});

	return result;
}
