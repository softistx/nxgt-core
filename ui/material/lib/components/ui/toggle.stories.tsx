import type { Meta, StoryObj } from '@storybook/react';
import { Bold } from 'lucide-react';
import { Toggle } from './toggle';

const meta = {
	title: 'Inputs/Toggle',
	component: Toggle,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		children: <Bold className="h-4 w-4" />,
	},
};

export const Outline: Story = {
	args: {
		variant: 'outlined',
		children: <Bold className="h-4 w-4" />,
	},
};
