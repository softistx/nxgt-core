import type { Meta, StoryObj } from '@storybook/react';
import {
	ResizableGroup,
	ResizablePanel,
	ResizableSeparator,
} from './resizable';

const meta = {
	title: 'Layout/Resizable',
	component: ResizableGroup,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof ResizableGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		orientation: 'horizontal',
	},
	render: function Component(props) {
		return (
			<ResizableGroup
				{...props}
				orientation="horizontal"
				className="max-w-md rounded-lg border md:min-w-[450px]"
			>
				<ResizablePanel defaultSize={50}>
					<div className="flex h-[200px] center p-6">
						<span className="font-semibold">One</span>
					</div>
				</ResizablePanel>
				<ResizableSeparator />
				<ResizablePanel defaultSize={50}>
					<ResizableGroup orientation="vertical">
						<ResizablePanel defaultSize={25}>
							<div className="flex h-full center p-6">
								<span className="font-semibold">Two</span>
							</div>
						</ResizablePanel>
						<ResizableSeparator />
						<ResizablePanel defaultSize={75}>
							<div className="flex h-full center p-6">
								<span className="font-semibold">Three</span>
							</div>
						</ResizablePanel>
					</ResizableGroup>
				</ResizablePanel>
			</ResizableGroup>
		);
	},
};
