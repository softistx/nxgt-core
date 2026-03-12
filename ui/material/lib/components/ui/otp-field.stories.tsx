import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { OtpField } from './otp-field';
import { DarkTheme } from './stories-dark-theme';

const meta = {
	title: 'Inputs/OtpField',
	component: OtpField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
		length: { control: 'number', min: 2, max: 10 },
	},
} satisfies Meta<typeof OtpField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Enter OTP',
		helperText: 'Enter the 6-digit code sent to your phone',
		length: 6,
	},
	render: function Component(props) {
		const [value, setValue] = useState('');

		return (
			<div className="w-96">
				<OtpField {...props} value={value} onChange={setValue} />
				<p className="mt-4 text-sm text-muted-foreground">
					Value: {value || 'empty'}
				</p>
			</div>
		);
	},
};

export const CustomLength: Story = {
	args: {
		label: 'Enter PIN',
		helperText: 'Enter your 4-digit PIN',
		length: 4,
	},
	render: function Component(props) {
		const [value, setValue] = useState('');

		return (
			<div className="w-96">
				<OtpField {...props} value={value} onChange={setValue} />
				<p className="mt-4 text-sm text-muted-foreground">
					Value: {value || 'empty'}
				</p>
			</div>
		);
	},
};

export const WithError: Story = {
	args: {
		label: 'Enter OTP',
		helperText: 'Invalid code. Please try again.',
		error: true,
		length: 6,
	},
	render: function Component(props) {
		const [value] = useState('12345');

		return (
			<div className="w-96">
				<OtpField {...props} value={value} onChange={() => {}} />
			</div>
		);
	},
};

export const Dark: Story = {
	args: {
		label: 'Enter OTP',
		helperText: 'Enter the 6-digit code sent to your phone',
		length: 6,
	},
	render: function Component(props) {
		const [value, setValue] = useState('');

		return (
			<DarkTheme>
				<div className="w-96">
					<OtpField {...props} value={value} onChange={setValue} />
					<p className="mt-4 text-sm text-muted-foreground">
						Value: {value || 'empty'}
					</p>
				</div>
			</DarkTheme>
		);
	},
};

export const Disabled: Story = {
	args: {
		label: 'Enter OTP',
		helperText: 'OTP input is disabled',
		disabled: true,
		length: 6,
	},
	render: function Component(props) {
		const [value, setValue] = useState('123456');

		return (
			<div className="w-96">
				<OtpField {...props} value={value} onChange={setValue} />
			</div>
		);
	},
};
