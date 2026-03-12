import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta = {
	title: 'Display/Badge',
	component: Badge,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		children: <span>99+</span>,
	},
};
