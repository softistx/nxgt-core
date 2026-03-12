import type { Meta, StoryObj } from '@storybook/react';
import { File } from 'lucide-react';
import { useState } from 'react';
import { DarkTheme } from './stories-dark-theme';
import { UploadField } from './upload-field';

const meta = {
	title: 'Inputs/UploadField',
	component: UploadField,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		error: { control: 'boolean' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta<typeof UploadField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		placeholder: 'Choose a file',
		label: 'UploadField',
		helperText: 'Please upload a file',
		trailing: 'Browse',
		leading: <File />,
	},
	render: function Component(props) {
		const [value, setValue] = useState<File>();
		return (
			<UploadField
				{...props}
				value={value?.name}
				onChange={(e) => {
					setValue(e.target.files?.[0]);
				}}
				className="w-md"
			/>
		);
	},
};

export const Dark: Story = {
	args: {
		placeholder: 'Choose a file',
		label: 'UploadField',
		helperText: 'Please upload a file',
	},
	render: function Component(props) {
		return (
			<DarkTheme>
				<UploadField {...props} />
			</DarkTheme>
		);
	},
};
