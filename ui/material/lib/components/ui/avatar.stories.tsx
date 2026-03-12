import type { Meta, StoryObj } from '@storybook/react';
import { Avatar } from './avatar';

const meta = {
	title: 'Display/Avatar',
	component: Avatar,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		src: 'https://github.com/shadcn.png',
		alt: '@shadcn',
		fallback: 'CN',
		className: 'size-12 rounded',
	},
};
