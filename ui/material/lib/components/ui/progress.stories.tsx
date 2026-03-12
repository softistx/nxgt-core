import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Progress } from './progress';
import { Slider } from './slider';

const meta = {
	title: 'Feedback/Progress',
	component: Progress,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: function Component(props) {
		const [progress, setProgress] = useState([13]);

		return (
			<div className="max-w-xs mx-auto w-full flex flex-col items-center">
				<Progress {...props} value={progress[0]} className="w-md" />
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
