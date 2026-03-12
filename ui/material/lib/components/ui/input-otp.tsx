import { OTPInput, OTPInputContext } from 'input-otp';
import { MinusIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../../lib/utils';

function InputOTP({
	className,
	containerClassName,
	...props
}: React.ComponentProps<typeof OTPInput> & {
	containerClassName?: string;
}) {
	return (
		<OTPInput
			data-slot="input-otp"
			containerClassName={cn(
				'flex items-center gap-2 has-disabled:opacity-50',
				containerClassName,
			)}
			className={cn('disabled:cursor-not-allowed', className)}
			{...props}
		/>
	);
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="input-otp-group"
			className={cn('flex items-center gap-2', className)}
			{...props}
		/>
	);
}

function InputOTPSlot({
	index,
	className,
	...props
}: React.ComponentProps<'div'> & {
	index: number;
}) {
	const inputOTPContext = React.useContext(OTPInputContext);
	const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {};

	return (
		<div
			data-slot="input-otp-slot"
			data-active={isActive}
			className={cn(
				'flex relative center outline-none ',
				'h-11 w-11 rounded-md border border-input bg-background text-center text-lg font-medium shadow-xs transition-all',
				'data-[active=true]:border-primary data-[active=true]:ring-primary/30 data-[active=true]:ring-[2px] data-[active=true]:z-10',
				'aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error',
				className,
			)}
			{...props}
		>
			{char}
			{hasFakeCaret && (
				<div className="pointer-events-none absolute inset-0 flex center">
					<div className="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
				</div>
			)}
		</div>
	);
}

function InputOTPSeparator({ ...props }: React.ComponentProps<'div'>) {
	return (
		<div data-slot="input-otp-separator" {...props}>
			<MinusIcon />
		</div>
	);
}

export { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot };
