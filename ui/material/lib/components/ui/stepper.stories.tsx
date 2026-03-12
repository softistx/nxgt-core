import type { Meta, StoryObj } from '@storybook/react';
import { Check, CreditCard } from 'lucide-react';
import { useState } from 'react';
import { Stepper } from './stepper';
import { TooltipProvider } from './tooltip';

const meta = {
	title: 'Navigation/Stepper',
	component: Stepper,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof Stepper>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		steps: [
			{
				icon: <CreditCard />,
				title: 'Payment',
				description: 'Proceed with the payment',
			},
			{
				icon: <Check />,
				title: 'Confirmation',
				description:
					'Are all data you entered correct ? Are all data you entered correct ?',
			},
		],
	},
	render: function Component(props) {
		const [activeStep, setActiveStep] = useState(0);
		return (
			<TooltipProvider>
				<Stepper active={activeStep} onChange={setActiveStep} {...props} />
			</TooltipProvider>
		);
	},
};
