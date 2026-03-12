import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Autocomplete } from './autocomplete';
import { frameworks } from './stories-consts';

const meta = {
	title: 'Inputs/Autocomplete',
	component: Autocomplete,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Autocomplete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
	args: {
		value: '',
		mode: 'single',
		label: 'Framework',
		placeholder: 'Choose a framework',
		helperText: 'Make sure to choose your favorite framework.',
		options: frameworks,
	},
	render: function Component(props) {
		const [value, setValue] = useState('');
		return (
			<Autocomplete
				{...props}
				mode="single"
				value={value}
				onValueChange={setValue}
			/>
		);
	},
};

export const Multiple: Story = {
	args: {
		value: [],
		mode: 'multiple',
		label: 'Framework',
		placeholder: 'Choose a framework',
		helperText: 'Make sure to choose your favorite framework.',
		options: frameworks,
	},
	render: function Component(props) {
		const [value, setValue] = useState<string[]>([]);
		return (
			<Autocomplete
				{...props}
				value={value}
				mode="multiple"
				onValueChange={setValue}
				className="max-w-md"
			/>
		);
	},
};
