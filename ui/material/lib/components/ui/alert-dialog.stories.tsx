import type { Meta, StoryObj } from '@storybook/react';
import { CircleFadingArrowUp, Rocket } from 'lucide-react';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from './alert-dialog';
import { Badge } from './badge';
import { Button } from './buttons/button';
import { Separator } from './separator';

const meta = {
	title: 'Feedback/AlertDialog',
	component: AlertDialog,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<AlertDialog {...props}>
				<AlertDialogTrigger asChild>
					<Button variant="outlined">Show Dialog</Button>
				</AlertDialogTrigger>
				<AlertDialogContent className="p-4">
					<AlertDialogHeader>
						<div className="mx-auto sm:mx-0 mb-4 flex h-9 w-9 center rounded-full bg-primary/10">
							<CircleFadingArrowUp className="h-[18px] w-[18px] text-primary" />
						</div>
						<AlertDialogTitle className="text-2xl font-bold tracking-tight">
							New Software Update Available
						</AlertDialogTitle>
						<Separator />
						<AlertDialogDescription className="!mt-3 text-[15px]">
							A new software update is available for your device. Please update
							to the latest version to continue using the app.
						</AlertDialogDescription>
						<div className="!mt-6 flex flex-wrap gap-2">
							<Badge variant="outlined" className="py-1">
								Faster Performance
							</Badge>
							<Badge variant="outlined" className="py-1">
								Advanced Blocks
							</Badge>
							<Badge variant="outlined" className="py-1">
								Customized Components
							</Badge>
							<Badge variant="outlined" className="py-1">
								UI Revamp
							</Badge>
							<Badge variant="outlined" className="py-1">
								Security Improvements
							</Badge>
							<Badge variant="outlined" className="py-1">
								Other Improvements
							</Badge>
							<Badge variant="outlined" className="py-1">
								Bug Fixes
							</Badge>
							<Badge variant="outlined" className="py-1">
								+ much more
							</Badge>
						</div>
					</AlertDialogHeader>
					<Separator />
					<AlertDialogFooter className="mt-4">
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction>
							<Rocket /> Update Now
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	},
};
