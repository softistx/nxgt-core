import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { TimePicker } from '../..';

const meta = {
	title: 'Inputs/TimePicker',
	component: TimePicker,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof TimePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Enter time',
	},
	render: function Component(props) {
		const [date, setDate] = useState<Date | undefined>(new Date());

		useEffect(() => {
			console.log(date?.toLocaleTimeString());
		}, [date]);
		return (
			<div>
				<h3>
					{date?.toLocaleDateString()} - {date?.toLocaleTimeString()}
				</h3>
				<TimePicker {...props} date={date} onChange={setDate} />
			</div>
		);
	},
};
