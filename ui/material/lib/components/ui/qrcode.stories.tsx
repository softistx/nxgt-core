import type { Meta, StoryObj } from '@storybook/react';
import { QRCode } from './qrcode';

const meta = {
	title: 'Display/QRCode',
	component: QRCode,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		value: { control: 'text' },
		size: { control: 'number' },
		bgColor: { control: 'color' },
		fgColor: { control: 'color' },
		level: {
			control: 'select',
			options: ['L', 'M', 'Q', 'H'],
		},
	},
	args: {},
} satisfies Meta<typeof QRCode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		value: 'https://github.com',
		size: 256,
	},
};

export const Small: Story = {
	args: {
		value: 'https://github.com',
		size: 128,
	},
};

export const Large: Story = {
	args: {
		value: 'https://github.com',
		size: 512,
	},
};

export const CustomColors: Story = {
	args: {
		value: 'https://github.com',
		size: 256,
		bgColor: '#f0f0f0',
		fgColor: '#0066cc',
	},
};

export const HighErrorCorrection: Story = {
	args: {
		value: 'https://github.com',
		size: 256,
		level: 'H',
	},
};

export const WithText: Story = {
	args: {
		value: 'Hello, World! This is a QR code with longer text content.',
		size: 256,
	},
};

export const WithLogo: Story = {
	args: {
		value: 'https://github.com',
		size: 256,
		level: 'H',
		logo: (
			<img
				src="https://avatars.githubusercontent.com/u/9919?s=200&v=4"
				alt="GitHub Logo"
				className="size-12 block"
			/>
		),
	},
};
