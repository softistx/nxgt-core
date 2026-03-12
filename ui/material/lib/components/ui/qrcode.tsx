'use client';

import QRCodePrimitive, {
	type QRCodeProps as QRCodePrimitiveProps,
} from 'react-qr-code';

import { cn } from '../../lib/utils';

export type QRCodeProps = {
	className?: string;
	logo?: React.ReactNode;
} & QRCodePrimitiveProps;

function QRCode({ className, logo, ...props }: QRCodeProps) {
	return (
		<div
			data-slot="qrcode"
			className={cn('relative bg-white p-4 inline-block', className)}
		>
			<QRCodePrimitive {...(props as any)} />
			{logo && (
				<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-2">
					{logo}
				</div>
			)}
		</div>
	);
}

export { QRCode };
