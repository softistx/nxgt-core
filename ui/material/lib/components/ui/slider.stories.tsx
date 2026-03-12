import type { Meta, StoryObj } from '@storybook/react';
import { Slider } from './slider';

const meta = {
	title: 'Inputs/Slider',
	component: Slider,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Slider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Slider',
		defaultValue: [10],
		max: 100,
		helperText: 'Slide to set a value',
	},
};

export const Range: Story = {
	args: {
		label: 'Slider',
		leading: 0,
		trailing: 100,
		defaultValue: [10, 30],
		max: 100,
		helperText: 'Slide to set a range values',
	},
};
