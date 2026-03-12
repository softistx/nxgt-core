import type { Meta, StoryObj } from '@storybook/react';
import { Info } from 'lucide-react';
import { IconButton } from '../..';

const meta = {
	title: 'Buttons/IconButton',
	component: IconButton,
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
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		variant: 'filled',
		children: <Info />,
	},
};

export const Outline: Story = {
	args: {
		variant: 'outlined',
		children: <Info />,
	},
};

export const Tonal: Story = {
	args: {
		variant: 'tonal',
		children: <Info />,
	},
};
