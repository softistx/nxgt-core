import type { Meta, StoryObj } from '@storybook/react';
import { CreditCard, Group } from 'lucide-react';
import { ActionCard } from './action-card';

const meta = {
	title: 'Layout/ActionCard',
	component: ActionCard,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		active: { control: 'boolean' },
	},
	args: {},
} satisfies Meta<typeof ActionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Small: Story = {
	args: {
		title: 'Credit Card',
		description: 'Visa, Mastercard, etc',
		icon: <CreditCard />,
	},
};

export const Medium: Story = {
	args: {
		variant: 'md',
		title: "I'm managing",
		description: 'You manage all business related activities.',
		icon: <Group />,
	},
};
