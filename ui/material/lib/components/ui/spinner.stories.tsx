import type { Meta, StoryObj } from '@storybook/react';
import { Spinner } from './spinner';

const meta = {
	title: 'Feedback/Spinner',
	component: Spinner,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		color: {
			control: 'radio',
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
		variant: {
			control: 'radio',
			options: ['1', '2', '3', '4'],
		},
	},
	args: {},
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};
