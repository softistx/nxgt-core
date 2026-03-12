import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './buttons/button';
import { Tooltip, TooltipProvider } from './tooltip';

const meta = {
	title: 'Display/Tooltip',
	component: Tooltip,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: { content: '' },
	render: function Component(props) {
		return (
			<TooltipProvider>
				<Tooltip {...props} content={<p>Add to library</p>}>
					<Button variant="outlined">Hover</Button>
				</Tooltip>
			</TooltipProvider>
		);
	},
};
