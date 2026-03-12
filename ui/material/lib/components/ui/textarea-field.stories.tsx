import type { Meta, StoryObj } from '@storybook/react';
import { DarkTheme } from './stories-dark-theme';
import { TextareaField } from './textarea-field';

const meta = {
	title: 'Inputs/TextareaField',
	component: TextareaField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof TextareaField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		placeholder: 'Enter value',
		label: 'TextareaField',
		helperText: 'Please provide text area field value',
	},
};

export const Dark: Story = {
	args: {
		placeholder: 'Enter value',
		label: 'TextareaField',
		helperText: 'Please provide text area field value',
	},
	render: function Component(props) {
		return (
			<DarkTheme>
				<TextareaField {...props} />
			</DarkTheme>
		);
	},
};
