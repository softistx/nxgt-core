import type { Meta, StoryObj } from '@storybook/react';
import { AccordionCard } from './accordion-card';

const meta = {
	title: 'Layout/Accordion',
	component: AccordionCard,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof AccordionCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const items = [
	{
		title: 'Is it accessible?',
		content: 'Yes. It adheres to the WAI-ARIA design pattern.',
	},
	{
		title: 'Is it styled?',
		content:
			"Yes. It comes with default styles that matches the other components' aesthetic.",
	},
	{
		title: 'Is it animated?',
		content:
			"Yes. It's animated by default, but you can disable it if you prefer.",
	},
];

export const Default: Story = {
	args: {
		items,
	},
	render: function Component() {
		return (
			<div className="w-lg">
				<AccordionCard items={items} />
			</div>
		);
	},
};
