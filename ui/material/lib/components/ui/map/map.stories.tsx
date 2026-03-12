import type { Meta, StoryObj } from '@storybook/react';
import { LocationMarker, MapComponent } from '../..';

const meta = {
	title: 'Media/Map',
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Map>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<MapComponent {...props} className="size-64">
				<LocationMarker />
			</MapComponent>
		);
	},
};
