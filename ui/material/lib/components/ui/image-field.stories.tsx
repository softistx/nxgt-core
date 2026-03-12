import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ImageField } from './image-field';

const meta = {
	title: 'Inputs/ImageField',
	component: ImageField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof ImageField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Avatar',
		required: true,
		helperText: 'Please provide text field value',
		description:
			'Avatars must comply with our policies or they will not be uploaded.',
	},
	render: function Component(props) {
		const [value, setValue] = useState<File>();
		return (
			<ImageField
				className="w-[20rem]"
				{...props}
				value={value}
				onChange={(e) => {
					setValue(e.target.files?.[0]);
				}}
			/>
		);
	},
};
