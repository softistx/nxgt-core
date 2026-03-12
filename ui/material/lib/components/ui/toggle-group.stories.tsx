import type { Meta, StoryObj } from '@storybook/react';
import { AlignCenter, Bold, Italic, Underline } from 'lucide-react';
import {
	ToggleGroup,
	ToggleGroupItem,
	ToggleGroupSeparator,
} from './toggle-group';

const meta = {
	title: 'Inputs/ToggleGroup',
	component: ToggleGroup,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		type: { control: 'select', options: ['single', 'multiple'] },
		variant: { control: 'select', options: ['default', 'outlined'] },
	},
	args: {},
} satisfies Meta<typeof ToggleGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {
	args: { type: 'single' },
	render: function Component(props) {
		return (
			<ToggleGroup {...props}>
				<ToggleGroupItem value="bold" aria-label="Toggle bold">
					<Bold />
				</ToggleGroupItem>
				<ToggleGroupItem value="italic" aria-label="Toggle italic">
					<Italic />
				</ToggleGroupItem>
				<ToggleGroupItem
					value="strikethrough"
					aria-label="Toggle strikethrough"
				>
					<Underline />
				</ToggleGroupItem>
				<ToggleGroupSeparator />
				<ToggleGroupItem value="aligncenter" aria-label="Align center">
					<AlignCenter />
				</ToggleGroupItem>
			</ToggleGroup>
		);
	},
};

export const Multiple: Story = {
	...Single,
	args: { type: 'multiple' },
};
