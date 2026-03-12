import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { HelperText } from './helper-text';
import {
	InputOTP,
	InputOTPGroup,
	InputOTPSeparator,
	InputOTPSlot,
} from './input-otp';
import { Label } from './label';

export type OtpFieldProps = {
	label?: React.ReactNode;
	helperText?: React.ReactNode;
	error?: boolean;
	length?: number;
} & Omit<ComponentProps<typeof InputOTP>, 'children' | 'maxLength'>;

export function OtpField({
	label,
	helperText,
	error,
	length = 6,
	className,
	id,
	...props
}: OtpFieldProps) {
	const fieldId =
		id || `otp-field-${Math.random().toString(36).substring(2, 9)}`;

	return (
		<div data-slot="otp-field" className={cn('grid w-full gap-1.5', className)}>
			{label && <Label htmlFor={fieldId}>{label}</Label>}
			<div className="flex">
				<InputOTP
					{...props}
					render={props.render as any}
					id={fieldId}
					maxLength={length}
					className={cn('flex gap-2', error && 'text-error')}
				>
					<InputOTPGroup>
						{[...Array(Math.floor(length / 2))].map((_, i) => (
							<InputOTPSlot
								key={`otp-slot-${Math.floor(length / 2) > 0 ? 'first' : 'only'}-${i}`}
								index={i}
								aria-invalid={error}
							/>
						))}
					</InputOTPGroup>
					{length > 2 && <InputOTPSeparator />}
					<InputOTPGroup>
						{[...Array(Math.ceil(length / 2))].map((_, i) => (
							<InputOTPSlot
								key={`otp-slot-second-${i}`}
								index={i + Math.floor(length / 2)}
								aria-invalid={error}
							/>
						))}
					</InputOTPGroup>
				</InputOTP>
			</div>
			{helperText && <HelperText error={error}>{helperText}</HelperText>}
		</div>
	);
}
