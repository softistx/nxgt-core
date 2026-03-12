import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CheckboxGroup } from './checkbox-group';
import { frameworks } from './stories-consts';

const meta = {
	title: 'Inputs/CheckboxGroup',
	component: CheckboxGroup,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof CheckboxGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Framework',
		helperText: 'Make sure to choose your favorite frameworks.',
		options: frameworks,
	},
	render: function Component(props) {
		const [value, setValue] = useState<string[]>([]);
		return (
			<div>
				<h5>{value.join(', ')}</h5>
				<CheckboxGroup
					defaultValue={props.options[0].value}
					{...props}
					value={value}
					onValueChange={setValue}
				/>
			</div>
		);
	},
};
