import type { ComponentProps } from 'react';
import { Provider } from 'react-redux';
import { CameraProvider } from './camera.provider';
import { CameraContent } from './camera-content';
import { store } from './state';

export type CameraProps = {} & ComponentProps<'div'>;

export function Camera({ ...props }: CameraProps) {
	return (
		<Provider store={store}>
			<CameraProvider>
				<CameraContent {...props} />
			</CameraProvider>
		</Provider>
	);
}
