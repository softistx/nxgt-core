import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SelectField } from './select-field';
import { frameworks } from './stories-consts';

const meta = {
	title: 'Inputs/SelectField',
	component: SelectField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof SelectField>;

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
			<SelectField
				defaultValue={props.options[0].value}
				{...props}
				value={value}
				onValueChange={setValue}
			/>
		);
	},
};
