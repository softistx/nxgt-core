import type { Meta, StoryObj } from '@storybook/react';
import { Info } from 'lucide-react';
import { ResponsiveButton } from '../..';

const meta = {
	title: 'Buttons/ResponsiveButton',
	component: ResponsiveButton,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		color: {
			control: 'select',
			options: [
				'primary',
				'secondary',
				'success',
				'info',
				'warning',
				'error',
				'default',
			],
		},
	},
	args: {},
} satisfies Meta<typeof ResponsiveButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		variant: 'filled',
		icon: <Info />,
		children: 'Info',
	},
};

export const Outline: Story = {
	args: {
		variant: 'outlined',
		icon: <Info />,
		children: 'Info',
	},
};

export const Tonal: Story = {
	args: {
		variant: 'tonal',
		icon: <Info />,
		children: 'Info',
	},
};
