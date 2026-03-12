import { cn } from '../../lib/utils';
import { Typography, type TypographyProps } from './typography';

export type HelperTextProps = {
	error?: boolean;
} & Omit<TypographyProps, 'variant'>;

export function HelperText({ error, className, ...props }: HelperTextProps) {
	return (
		<Typography
			data-slot="helper-text"
			variant={'caption'}
			className={cn(
				'flex pl-0.5 truncate text-wrap',
				{ 'text-error': error },
				className,
			)}
			{...props}
		/>
	);
}
