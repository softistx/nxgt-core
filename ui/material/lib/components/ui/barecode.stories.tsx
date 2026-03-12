import type { Meta, StoryObj } from '@storybook/react';
import { Barecode } from './barecode';

const meta = {
	title: 'Display/Barecode',
	component: Barecode,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		format: {
			control: 'select',
			options: [
				'CODE128',
				'CODE39',
				'EAN13',
				'EAN8',
				'UPC',
				'ITF14',
				'MSI',
				'pharmacode',
				'codabar',
			],
		},
		width: { control: 'number' },
		height: { control: 'number' },
		displayValue: { control: 'boolean' },
		background: { control: 'color' },
		lineColor: { control: 'color' },
		margin: { control: 'number' },
	},
	args: {},
} satisfies Meta<typeof Barecode>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		value: '123456789012',
		format: 'CODE128',
		displayValue: true,
	},
};

export const EAN13: Story = {
	args: {
		value: '5901234123457',
		format: 'EAN13',
		displayValue: true,
	},
};

export const CODE39: Story = {
	args: {
		value: 'CODE39',
		format: 'CODE39',
		displayValue: true,
	},
};

export const CustomStyle: Story = {
	args: {
		value: '123456789012',
		format: 'CODE128',
		displayValue: true,
		background: '#f0f0f0',
		lineColor: '#0066cc',
		width: 3,
		height: 80,
		margin: 15,
	},
};

export const NoDisplayValue: Story = {
	args: {
		value: '123456789012',
		format: 'CODE128',
		displayValue: false,
	},
};
