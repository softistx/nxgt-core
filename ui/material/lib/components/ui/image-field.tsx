import { ChevronsLeft } from 'lucide-react';
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useRef,
} from 'react';
import placeholder from '../../assets/images/placeholder.png';
import { cn } from '../../lib/utils';
import { Button } from './buttons/button';
import { HelperText } from './helper-text';
import { Input } from './input';
import { Label } from './label';
import { Typography } from './typography';

export type ImageFieldProps = {
	label?: ReactNode;
	buttonText?: ReactNode;
	helperText?: ReactNode;
	error?: boolean;
	description?: ReactNode;
	value?: File | 'string';
	placeholder?: string;
} & Omit<ComponentProps<'input'>, 'type' | 'value' | 'multiple'>;

export function ImageField({
	label,
	error,
	helperText,
	description,
	buttonText,
	value,
	className,
	accept,
	...props
}: ImageFieldProps) {
	const id = props.id ?? 'image-field';
	const ref = useRef<HTMLInputElement>(null);

	const handleSelection = useCallback(() => {
		ref.current?.click();
	}, []);

	const component = (
		<div
			data-filled={!!value}
			aria-invalid={error}
			className={cn(
				'transition-all flex gap-2 p-3 min-w-[280px] h-[7rem] rounded bg-muted data-filled:bg-primary/10',
				'border border-transparent aria-invalid:border-error/40',
				className,
			)}
		>
			<button
				type="button"
				onClick={handleSelection}
				className="h-full aspect-square bg-primary/30 border-2 border-dashed border-primary rounded-md p-0 overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary"
			>
				<img
					className="w-full h-full object-cover"
					src={
						value
							? typeof value === 'string'
								? value
								: URL.createObjectURL(value)
							: (props.placeholder ?? placeholder)
					}
					alt={value ? 'Selected image' : 'Click to select image'}
				/>
			</button>
			<div className="flex flex-col justify-between flex-1 gap-2">
				{description && (
					<Typography variant={'body-small'}>{description}</Typography>
				)}
				<Button
					onClick={handleSelection}
					variant={'outlined'}
					className="self-end justify-self-end rounded-full"
				>
					<ChevronsLeft />
					<Typography variant={'body-small'}>
						{buttonText ?? 'Tab to choose file'}
					</Typography>
				</Button>
			</div>
			<Input
				accept={accept ?? 'image/*'}
				type="file"
				ref={ref}
				hidden
				aria-invalid={error}
				{...props}
			/>
		</div>
	);

	return (
		<div
			data-slot="image-field"
			data-pw={'image-field'}
			className="grid w-full gap-1.5 min-w-[280px]"
		>
			<Label withAsterisk={props.required} htmlFor={id}>
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
