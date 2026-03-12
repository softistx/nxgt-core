import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CircularProgress } from './circular-progress';
import { Slider } from './slider';

const meta = {
	title: 'Feedback/CircularProgress',
	component: CircularProgress,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: [
				'primary',
				'secondary',
				'success',
				'info',
				'warning',
				'error',
				'default',
			],
		},
	},
	args: {},
} satisfies Meta<typeof CircularProgress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		value: 0,
	},
	render: function Component(props) {
		const [progress, setProgress] = useState([13]);

		return (
			<div className="max-w-xs mx-auto w-full flex flex-col items-center">
				<CircularProgress
					{...props}
					value={progress[0]}
					size={120}
					strokeWidth={10}
					showLabel
					labelClassName="text-xl font-bold"
					renderLabel={(progress) => `${progress}%`}
				/>
				<Slider
					defaultValue={progress}
					max={100}
					step={1}
					onValueChange={setProgress}
					className="mt-6"
				/>
			</div>
		);
	},
};
