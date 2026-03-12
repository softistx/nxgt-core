import type { Meta, StoryObj } from '@storybook/react';
import { Camera } from '../camera';

const meta = {
	title: 'Media/Camera',
	component: Camera,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Camera>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(args) {
		return <Camera {...args} />;
	},
};
