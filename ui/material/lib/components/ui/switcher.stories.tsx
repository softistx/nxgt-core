import type { Meta, StoryObj } from '@storybook/react';
import { Switcher, type SwitcherItem } from './switcher';

const meta = {
	title: 'Layout/Switcher',
	component: Switcher,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Switcher>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
	{
		id: '1',
		title: 'Workspace 1',
		subtitle: 'abc@example.com',
	},
	{
		id: '2',
		title: 'Workspace 2',
		subtitle: 'def@example.com',
	},
	{
		id: '3',
		title: 'Workspace 3',
		subtitle: 'ghi@example.com',
	},
] satisfies SwitcherItem[];

export const Default: Story = {
	args: {
		value: items[0],
		label: 'Workspaces',
		options: items,
	},
};
