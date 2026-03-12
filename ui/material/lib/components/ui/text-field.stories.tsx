import type { Meta, StoryObj } from '@storybook/react';
import { Eye } from 'lucide-react';
import { DarkTheme } from './stories-dark-theme';
import { TextField } from './text-field';

const meta = {
	title: 'Inputs/TextField',
	component: TextField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		placeholder: 'Text Field',
		label: 'TextField',
		helperText: 'Please provide text field value',
		trailing: <Eye />,
	},
};

export const Dark: Story = {
	args: {
		placeholder: 'Enter value',
		label: 'TextField',
		helperText: 'Please provide text field value',
	},
	render: function Component(props) {
		return (
			<DarkTheme>
				<TextField {...props} />
			</DarkTheme>
		);
	},
};
