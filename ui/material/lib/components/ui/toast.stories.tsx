import type { Meta, StoryObj } from '@storybook/react';
import { InfoIcon } from 'lucide-react';
import { Button } from './buttons/button';
import { Toast, Toaster, toast } from './toast';

const meta = {
	title: 'Feedback/Toast',
	component: Toast,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		id: '0',
		action: { label: '', onClick: () => {} },
	},
	render: function Component() {
		return (
			<div className="dark">
				<Toaster />
				<Button
					variant={'outlined'}
					onClick={() => {
						toast({
							title: 'This is a headless toast',
							description:
								'You have full control of styles and jsx, while still having...',
							action: {
								label: 'Reply',
								onClick: () => {},
							},
							icon: <InfoIcon />,
						});
					}}
				>
					Show Toast
				</Button>
			</div>
		);
	},
};
