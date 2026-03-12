import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import type { DateRange } from 'react-day-picker';
import { DateRangeField } from './date-range-field';

const meta = {
	title: 'Inputs/DateRangeField',
	component: DateRangeField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof DateRangeField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Date Range Field',
		helperText: 'Please, choose a valid date range',
	},
	render: function Component(props) {
		const [value, setValue] = useState<DateRange | undefined>({
			from: new Date(),
			to: new Date(),
		});
		return (
			<div>
				<DateRangeField {...props} value={value} onValueChange={setValue} />
			</div>
		);
	},
};
