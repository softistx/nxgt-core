import type { Meta, StoryObj } from '@storybook/react';
import { ResponsiveGrid } from './responsive-grid';

const meta = {
	title: 'Layout/ResponsiveGrid',
	component: ResponsiveGrid,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof ResponsiveGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: function Component(props) {
		return (
			<ResponsiveGrid {...props} className="w-md">
				{['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'].map(
					(item) => (
						<div key={item} className={'bg-secondary even:bg-primary'}>
							Item {item}
						</div>
					),
				)}
			</ResponsiveGrid>
		);
	},
};
