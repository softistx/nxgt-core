import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';

import { cn } from '../../lib/utils';

export type LabelProps = { withAsterisk?: boolean } & ComponentProps<
	typeof LabelPrimitive.Root
>;

export function Label({ className, withAsterisk, ...props }: LabelProps) {
	return (
		<LabelPrimitive.Root
			data-slot="label"
			className={cn(
				'flex items-center pl-0.5 gap-2 text-sm leading-none font-semibold select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
				className,
			)}
			{...props}
		>
			{withAsterisk ? (
				<div className="inline-flex">
					{props.children}
					<span className="text-error">*</span>
				</div>
			) : (
				props.children
			)}
		</LabelPrimitive.Root>
	);
}
