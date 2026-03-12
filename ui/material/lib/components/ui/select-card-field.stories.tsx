import type { Meta, StoryObj } from '@storybook/react';
import { Atom } from 'lucide-react';
import { useState } from 'react';
import { SelectCardField } from './select-card-field';
import { frameworks } from './stories-consts';

const meta = {
	title: 'Inputs/SelectCardField',
	component: SelectCardField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof SelectCardField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
	args: {
		mode: 'single',
		label: 'Select framework',
		value: [],
		options: frameworks.slice(0, 3).map((item) => ({
			title: item.label,
			value: item.value,
			icon: <Atom />,
		})),
	},
	render: function Component(props) {
		const [value, setValue] = useState<string[]>([]);
		return (
			<SelectCardField {...props} value={value} onValueChange={setValue} />
		);
	},
};

export const Multiple: Story = {
	args: {
		...Simple.args,
		error: true,
		helperText: 'Please, provide only supported frameworks',
		mode: 'multiple',
	},
	render: function Component(props) {
		const [value, setValue] = useState<string[]>([]);
		return (
			<SelectCardField {...props} value={value} onValueChange={setValue} />
		);
	},
};
