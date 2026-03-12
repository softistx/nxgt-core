import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { DateField } from './date-field';

const meta = {
	title: 'Inputs/DateField',
	component: DateField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof DateField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Date Field',
		helperText: 'Please, choose a valid date',
	},
	render: function Component(props) {
		const [value, setValue] = useState<Date | undefined>(new Date());
		return (
			<div>
				<h5>{value?.toISOString()}</h5>
				<DateField {...props} value={value} onValueChange={setValue} />
			</div>
		);
	},
};
