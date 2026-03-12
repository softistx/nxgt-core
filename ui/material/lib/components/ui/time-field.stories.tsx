import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { TimeField } from './time-field';

const meta = {
	title: 'Inputs/TimeField',
	component: TimeField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof TimeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Time Field',
		helperText: 'Please, choose a valid time',
	},
	render: function Component(props) {
		const [value, setValue] = useState<Date | undefined>(new Date());
		return (
			<div>
				<h5>{value?.toISOString()}</h5>
				<TimeField {...props} value={value} onValueChange={setValue} />
			</div>
		);
	},
};
