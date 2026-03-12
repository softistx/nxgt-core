import { Pause, Play } from 'lucide-react';
import { type ComponentProps, useCallback } from 'react';
import { cn } from '../../../lib';
import { Button, IconButton } from '../buttons';
import { useCamera } from './use-camera';

export type CameraProps = {} & ComponentProps<'div'>;

export function CameraContent({ className, ...props }: CameraProps) {
	const { videoRef, state, actions } = useCamera();

	const handleStreaming = useCallback(() => {
		if (state.isStreaming) {
			actions.stopStream();
		} else {
			actions.startStream();
		}
	}, [state.isStreaming, actions]);

	return (
		<div
			className={cn('flex relative w-full h-full gap-2', className)}
			{...props}
		>
			<div className="grid gap-2">
				{/** biome-ignore lint/a11y/useMediaCaption: Ignore for streaming */}
				<video
					ref={videoRef}
					className={cn('w-full max-w-lg right-1 ring-primary')}
					autoPlay
					playsInline
				/>
				<Button disabled={!state.isStreaming} onClick={actions.capturePhoto}>
					Take Capture
				</Button>
			</div>
			<div>
				<div className="flex justify-end">
					<IconButton
						variant={'tonal'}
						color={state.isStreaming ? 'success' : 'warning'}
						className="animate-pulse"
						onClick={handleStreaming}
					>
						{state.isStreaming ? <Pause /> : <Play />}
					</IconButton>
				</div>
				{state.capturedImage && (
					<img
						src={state.capturedImage}
						alt="Captured"
						className="w-full max-w-lg mt-4"
					/>
				)}
			</div>
		</div>
	);
}
