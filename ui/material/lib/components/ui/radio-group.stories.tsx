import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RadioGroup } from './radio-group';
import { frameworks } from './stories-consts';

const meta = {
	title: 'Inputs/RadioGroup',
	component: RadioGroup,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		value: '',
		label: 'Framework',
		helperText: 'Make sure to choose your favorite framework.',
		options: frameworks,
	},
	render: function Component(props) {
		const [value, setValue] = useState('');
		return (
			<RadioGroup
				defaultValue={props.options[0].value}
				{...props}
				value={value}
				onValueChange={setValue}
			/>
		);
	},
};
