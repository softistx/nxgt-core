'use client';

import BarecodePrimitive, { type BarcodeProps } from 'react-barcode';

import { cn } from '../../lib/utils';

export type BarecodeProps = {} & BarcodeProps;

function Barecode({ className, ...props }: BarecodeProps) {
	return (
		<BarecodePrimitive
			data-slot="barecode"
			className={cn('', className)}
			{...props}
		/>
	);
}

export { Barecode };
