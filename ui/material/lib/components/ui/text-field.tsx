import { type ReactNode, useId } from 'react';
import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import { Input, type InputProps } from './input';
import { Label } from './label';

export type TextFieldProps = {
	label?: ReactNode;
	helperText?: ReactNode;
	leading?: ReactNode;
	trailing?: ReactNode;
	error?: boolean;
} & InputProps;

export function TextField({
	error,
	helperText,
	label,
	className,
	leading,
	trailing,
	...props
}: TextFieldProps) {
	const id = useId();

	const component = (
		<div
			className={cn('relative', {
				'*:first:size-8 *:first:absolute *:first:top-[calc(50%-16px)] *:first:left-1.5 [&_input]:pl-10 *:first:bg-muted/80 *:first:text-muted-foreground':
					!!leading,
				'*:last:size-8 *:last:absolute *:last:top-[calc(50%-16px)] *:last:right-1.5 [&_input]:pr-.5 *:last:bg-muted/80  *:last:text-muted-foreground':
					!!trailing,
			})}
		>
			{leading && leading}
			<Input
				aria-invalid={error}
				{...props}
				id={props.id ?? id}
				className={cn(
					'transition-all hover:border-primary hover:ring-[2px] hover:ring-primary/25',
				)}
			/>
			{trailing && trailing}
		</div>
	);

	return (
		<div
			data-slot="text-field"
			className={cn('grid w-full gap-1.5', className)}
		>
			<Label withAsterisk={props.required} htmlFor={props.id ?? id}>
				{label}
			</Label>
			{helperText ? (
				<div className="flex flex-col gap-0.5">
					{component}
					<HelperText error={error}>{helperText}</HelperText>
				</div>
			) : (
				component
			)}
		</div>
	);
}
