import type { Meta, StoryObj } from '@storybook/react';
import { Atom } from 'lucide-react';
import { AlertDialogAction, AlertDialogCancel } from './alert-dialog';
import { Button } from './buttons/button';
import { IconButton } from './buttons/icon-button';
import { CustomAlertDialog } from './custom-alert-dialog';

const meta = {
	title: 'Feedback/CustomAlertDialog',
	component: CustomAlertDialog,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof CustomAlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<CustomAlertDialog
				icon={
					<IconButton variant={'tonal'}>
						<Atom />
					</IconButton>
				}
				title="Custom Alert Dialog"
				trigger={<Button variant="outlined">Show Dialog</Button>}
				description="This is a custom alert dialog using the CustomAlertDialog component."
				footer={
					<>
						<AlertDialogCancel variant="outlined">Cancel</AlertDialogCancel>
						<AlertDialogAction>Accept</AlertDialogAction>
					</>
				}
				{...props}
			>
				<p>Here is some custom content inside the dialog.</p>
			</CustomAlertDialog>
		);
	},
};
