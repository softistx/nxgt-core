import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta = {
	title: 'Layout/Separator',
	component: Separator,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<div
				style={{
					display: 'flex',
					flexDirection: 'column',
					width: '400px',
					height: '400px',
					justifyContent: 'center',
					alignItems: 'center',
					padding: '16px',
					gap: '16px',
					backgroundColor: 'var(--background)',
				}}
			>
				<p>Example text 1</p>
				<Separator {...props} />
				<p>Example text 2</p>
			</div>
		);
	},
};
