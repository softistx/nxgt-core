import type { Meta, StoryObj } from '@storybook/react';
import { Book, Calendar, Camera } from 'lucide-react';
import { BottomAppBar, IconButton } from '../..';

const meta = {
	title: 'Navigation/BottomAppBar',
	component: BottomAppBar,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof BottomAppBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<BottomAppBar {...props}>
				<IconButton data-state="active">
					<Camera />
				</IconButton>
				<IconButton>
					<Book />
				</IconButton>
				<IconButton>
					<Calendar />
				</IconButton>
			</BottomAppBar>
		);
	},
};
