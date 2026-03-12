'use client';

import * as AvatarPrimitive from '@radix-ui/react-avatar';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '../../lib/utils';

export type AvatarProps = {
	src?: string;
	alt?: string;
	fallback?: ReactNode;
} & ComponentProps<typeof AvatarPrimitive.Root>;

function Avatar({ src, alt, fallback, ...props }: AvatarProps) {
	return (
		<AvatarBase {...props}>
			{src && <AvatarImage src={src} alt={alt} />}
			{fallback && <AvatarFallback>{fallback}</AvatarFallback>}
		</AvatarBase>
	);
}

function AvatarBase({
	className,
	...props
}: ComponentProps<typeof AvatarPrimitive.Root>) {
	return (
		<AvatarPrimitive.Root
			data-slot="avatar"
			className={cn(
				'relative flex size-8 shrink-0 overflow-hidden rounded-full',
				className,
			)}
			{...props}
		/>
	);
}

function AvatarImage({
	className,
	...props
}: ComponentProps<typeof AvatarPrimitive.Image>) {
	return (
		<AvatarPrimitive.Image
			data-slot="avatar-image"
			className={cn('aspect-square size-full', className)}
			{...props}
		/>
	);
}

function AvatarFallback({
	className,
	...props
}: ComponentProps<typeof AvatarPrimitive.Fallback>) {
	return (
		<AvatarPrimitive.Fallback
			data-slot="avatar-fallback"
			className={cn('bg-muted flex size-full center rounded-full', className)}
			{...props}
		/>
	);
}

export { Avatar, AvatarBase, AvatarFallback, AvatarImage };
