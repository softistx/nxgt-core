import type { Meta, StoryObj } from '@storybook/react';
import { CircleAlert } from 'lucide-react';
import { Alert } from './alert';

const meta = {
	title: 'Feedback/Alert',
	component: Alert,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
	args: {
		title: 'Attention',
		icon: <CircleAlert />,
		description:
			"Tip: This guide assumes you've already read the Essentials Guide. Read that first if you're new to Angular.",
	},
};

export const Secondary: Story = {
	args: {
		...Primary.args,
		variant: 'secondary',
	},
};

export const Success: Story = {
	args: {
		...Primary.args,
		variant: 'success',
	},
};

export const Info: Story = {
	args: {
		...Primary.args,
		variant: 'info',
	},
};

export const Warning: Story = {
	args: {
		...Primary.args,
		variant: 'warning',
	},
};

export const ErrorStory: Story = {
	args: {
		...Primary.args,
		variant: 'error',
	},
};
