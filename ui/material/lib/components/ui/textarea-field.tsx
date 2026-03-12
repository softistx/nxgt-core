import { type ComponentProps, type ReactNode, useId } from 'react';
import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { Label } from './label';

export type TextareaProps = {
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
} & ComponentProps<'textarea'>;

export function TextareaField({
	error,
	helperText,
	label,
	className,
	placeholder,
	...props
}: TextareaProps) {
	const id = useId();

	return (
		<div
			data-slot="textarea-field"
			className={cn('grid w-full gap-1.5', className)}
		>
			<Label withAsterisk={props.required} htmlFor={props.id ?? id}>
				{label}
			</Label>
			{helperText ? (
				<div className="flex flex-col gap-0.5">
					<Comp {...props} placeholder={placeholder} id={props.id ?? id} />
					<HelperText error={error}>{helperText}</HelperText>
				</div>
			) : (
				<Comp {...props} placeholder={placeholder} id={props.id ?? id} />
			)}
		</div>
	);
}

export function Comp({ className, ...props }: ComponentProps<'textarea'>) {
	return (
		<textarea
			data-slot="textarea"
			data-pw={props.name ?? 'textarea'}
			className={cn(
				'transition-all resize-none bg-muted/5 not-placeholder-shown:bg-primary/10 disabled:bg-transparent',
				'hover:border-primary hover:ring-[2px] hover:ring-primary/25',
				'border-input placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-primary/30 focus-visible:ring-[2px]',
				'aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error flex',
				'field-sizing-content min-h-16 w-full min-w-[280px] rounded-sm border px-3 py-2 text-base shadow-xs',
				'outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
				className,
			)}
			{...props}
		/>
	);
}
