import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

function Table({ className, ...props }: ComponentProps<'table'>) {
	return (
		<div
			data-pw="table"
			data-slot="table"
			className="relative w-full overflow-x-auto rounded rounded-xs shadow-xs p-1"
		>
			<table
				data-slot="table"
				className={cn('table-auto w-full caption-bottom text-sm', className)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
	return (
		<thead
			data-pw="table-header"
			data-slot="table-header"
			className={cn('[&_tr]:min-g-14! bg-primary/10', className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
	return (
		<tbody
			data-slot="table-body"
			data-pw="table-body"
			className={cn('[&_tr:last-child]:border-0 min-h-12', className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: ComponentProps<'tfoot'>) {
	return (
		<tfoot
			data-pw="table-footer"
			data-slot="table-footer"
			className={cn(
				'bg-primary/10 font-medium [&>tr]:last:border-b-0',
				className,
			)}
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: ComponentProps<'tr'>) {
	return (
		<tr
			data-pw="table-row"
			data-slot="table-row"
			className={cn(
				'min-h-14 hover:shadow data-[state=selected]:bg-primary even:data-[state=selected]:bg-primary/80 data-[state=selected]:text-primary-foreground transition-colors bg-background-light even:bg-primary/5',
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: ComponentProps<'th'>) {
	return (
		<th
			data-pw="table-head"
			data-slot="table-head"
			className={cn(
				'px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: ComponentProps<'td'>) {
	return (
		<td
			data-pw="table-cell"
			data-slot="table-cell"
			className={cn(
				'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] overflow-ellipsis',
				className,
			)}
			{...props}
		/>
	);
}

function TableCaption({ className, ...props }: ComponentProps<'caption'>) {
	return (
		<caption
			data-pw="table-caption"
			data-slot="table-caption"
			className={cn('text-primary-foreground mt-4 text-sm', className)}
			{...props}
		/>
	);
}

export {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
};
