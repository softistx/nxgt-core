import type { Meta, StoryObj } from '@storybook/react';
import { X } from 'lucide-react';
import { IconButton, type IconButtonProps } from './buttons/icon-button';
import { Chip } from './chip';

const meta = {
	title: 'Display/Chip',
	component: Chip,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		active: { control: 'boolean' },
		color: {
			control: 'select',
			options: [
				'primary',
				'secondary',
				'success',
				'info',
				'warning',
				'error',
				'default',
			],
		},
	},
	args: {},
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		label: 'Chip',
		trailing: (
			<IconButton>
				<X />
			</IconButton>
		),
	},
	render: function Component(props) {
		return (
			<Chip
				{...props}
				trailing={
					<IconButton
						variant={props.variant as IconButtonProps['variant']}
						color={props.color}
					>
						<X />
					</IconButton>
				}
			/>
		);
	},
};
