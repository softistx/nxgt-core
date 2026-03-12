import type { Meta, StoryObj } from '@storybook/react';
import { Camera } from 'lucide-react';
import { IconButton } from './buttons/icon-button';
import { ListTile } from './list-tile';

const meta = {
	title: 'Display/ListTile',
	component: ListTile,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof ListTile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		title: 'Blood Pressure',
		subtitle: '12.4 x 2048 mg/zl',
	},
	render: function Component(props) {
		return <ListTile className="max-w-max" {...props} />;
	},
};

export const Leading: Story = {
	args: {
		title: 'Camera',
		subtitle: '1024 x 2048 Mpx',
		leading: (
			<IconButton variant={'tonal'}>
				<Camera />
			</IconButton>
		),
	},
	render: function Component(props) {
		return <ListTile className="max-w-max" {...props} />;
	},
};
