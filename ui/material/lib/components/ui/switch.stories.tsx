import type { Meta, StoryObj } from '@storybook/react';
import { Switch } from './switch';

const meta = {
	title: 'Inputs/Switch',
	component: Switch,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const Description: Story = {
	args: {
		label: 'Switch',
		placeholder: 'Do you want to switch ?',
	},
};
