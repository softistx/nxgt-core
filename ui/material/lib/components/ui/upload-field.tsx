import { type ReactNode, useId, useRef } from 'react';
import { cn } from '../../lib/utils';
import { Button } from './buttons/button';
import { HelperText } from './helper-text';
import { Input, type InputProps, inputDefaultClassNames } from './input';
import { Label } from './label';
import { Typography } from './typography';

export type UploadFieldProps = {
	label?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
} & UploadInputProps;

export function UploadField({
	error,
	helperText,
	label,
	...props
}: UploadFieldProps) {
	const id = useId();

	return (
		<div className="grid w-full gap-1.5 min-w-[280px]">
			<Label withAsterisk={props.required} htmlFor={props.id ?? id}>
				{label}
			</Label>
			{helperText ? (
				<div className="flex flex-col gap-0.5">
					<UploadInput error={error} {...props} id={props.id ?? id} />
					<HelperText error={error}>{helperText}</HelperText>
				</div>
			) : (
				<UploadInput error={error} {...props} id={props.id ?? id} />
			)}
		</div>
	);
}
type UploadInputProps = {
	error?: boolean;
	leading?: ReactNode;
	trailing?: ReactNode;
} & Omit<InputProps, 'type'>;

function UploadInput({
	error,
	leading,
	trailing,
	className,
	placeholder,
	value,
	...props
}: UploadInputProps) {
	const ref = useRef<HTMLInputElement>(null);
	return (
		<div aria-invalid={error} className={cn(inputDefaultClassNames, className)}>
			{leading && leading}
			<Typography
				className={cn('w-full line-clamp-1 text-ellipsis', {
					'text-muted-foreground': !value?.toString()?.length,
				})}
			>
				{value?.toString()?.length ? value : placeholder}
			</Typography>
			<Input ref={ref} hidden type="file" aria-invalid={error} {...props} />
			{trailing && (
				<Button
					onClick={() => {
						ref.current?.click();
					}}
					className="rounded-full"
				>
					{trailing}
				</Button>
			)}
		</div>
	);
}
