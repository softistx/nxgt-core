import {
	ChevronLeftIcon,
	ChevronRightIcon,
	MoreHorizontalIcon,
} from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { buttonVariants } from './buttons/button';

function Pagination({ className, ...props }: ComponentProps<'nav'>) {
	return (
		<nav
			aria-label="pagination"
			data-slot="pagination"
			data-pw="pagination"
			className={cn('mx-auto flex w-full justify-center', className)}
			{...props}
		/>
	);
}

function PaginationContent({ className, ...props }: ComponentProps<'ul'>) {
	return (
		<ul
			data-slot="pagination-content"
			className={cn('flex flex-row items-center gap-1', className)}
			{...props}
		/>
	);
}

function PaginationItem({ ...props }: ComponentProps<'li'>) {
	return <li data-slot="pagination-item" {...props} />;
}

type PaginationLinkProps = {
	isActive?: boolean;
} & ComponentProps<'a'>;

function PaginationLink({
	className,
	isActive,
	...props
}: PaginationLinkProps) {
	return (
		<a
			aria-current={isActive ? 'page' : undefined}
			data-slot="pagination-link"
			data-active={isActive}
			className={cn(
				buttonVariants({
					variant: isActive ? 'filled' : 'link',
				}),
				className,
			)}
			{...props}
		/>
	);
}

function PaginationPrevious({
	className,
	label,
	icon,
	...props
}: { label?: ReactNode; icon?: ReactNode } & ComponentProps<
	typeof PaginationLink
>) {
	return (
		<PaginationLink
			aria-label="Go to previous page"
			className={cn('gap-1 px-2.5 sm:pl-2.5', className)}
			{...props}
		>
			{icon ?? <ChevronLeftIcon />}
			<div className="hidden sm:block">{label ?? 'Previous'}</div>
		</PaginationLink>
	);
}

function PaginationNext({
	className,
	label,
	icon,
	...props
}: { label?: ReactNode; icon?: ReactNode } & ComponentProps<
	typeof PaginationLink
>) {
	return (
		<PaginationLink
			aria-label="Go to next page"
			className={cn('gap-1 px-2.5 sm:pr-2.5', className)}
			{...props}
		>
			<div className="hidden sm:block">{label ?? 'Next'}</div>
			{icon ?? <ChevronRightIcon />}
		</PaginationLink>
	);
}

function PaginationEllipsis({ className, ...props }: ComponentProps<'span'>) {
	return (
		<span
			aria-hidden
			data-slot="pagination-ellipsis"
			className={cn('flex size-9 center', className)}
			{...props}
		>
			<MoreHorizontalIcon className="size-4" />
			<span className="sr-only">More pages</span>
		</span>
	);
}

export {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
};
