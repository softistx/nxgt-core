import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';

export type InputProps = ComponentProps<'input'>;

export const inputDefaultClassNames = [
	'inline-flex gap-2 items-center h-11 w-full bg-muted/5 not-placeholder-shown:bg-primary/10 disabled:bg-transparent',
	'file:text-muted-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground border-input',
	'rounded border px-2 py-1 text-base shadow-xs transition-all outline-none file:inline-flex',
	'file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
	'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
	'focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[2px]',
	'aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error',
];

export function Input({ className, type = 'text', ...props }: InputProps) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(inputDefaultClassNames, className)}
			data-pw={props.name ?? 'input'}
			{...props}
		/>
	);
}
