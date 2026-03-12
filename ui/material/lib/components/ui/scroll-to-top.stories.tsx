import type { Meta, StoryObj } from '@storybook/react';
import { ChevronsUp, ChevronUp, MoveUp } from 'lucide-react';
import { ScrollToTop } from './scroll-to-top';

const meta = {
	title: 'Navigation/ScrollToTop',
	component: ScrollToTop,
	parameters: {
		layout: 'fullscreen',
	},
	tags: ['autodocs'],
	argTypes: {
		variant: {
			control: 'select',
			options: ['filled', 'tonal', 'outlined'],
		},
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
		threshold: {
			control: 'number',
			description: 'Scroll threshold in pixels before showing the button',
		},
		behavior: {
			control: 'select',
			options: ['smooth', 'instant', 'auto'],
			description: 'Scroll behavior when clicking the button',
		},
	},
	args: {
		variant: 'filled',
		color: 'primary',
		threshold: 300,
		behavior: 'smooth',
	},
	decorators: [
		(Story) => (
			<div className="h-screen overflow-auto">
				<div className="max-h-[648px] p-8">
					<h1 className="text-4xl font-bold mb-4">Scroll To Top Demo</h1>
					<p className="text-muted-foreground mb-8">
						Scroll down to see the button appear
					</p>
					<div className="space-y-4">
						{Array.from({ length: 50 }).map((_, i) => (
							<div
								key={i}
								className="p-4 border rounded-lg bg-card text-card-foreground"
							>
								<p className="text-lg font-medium">Section {i + 1}</p>
								<p className="text-sm text-muted-foreground">
									Keep scrolling to test the scroll-to-top functionality
								</p>
							</div>
						))}
					</div>
				</div>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ScrollToTop>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
};

export const Tonal: Story = {
	args: {
		variant: 'tonal',
	},
};

export const Outlined: Story = {
	args: {
		variant: 'outlined',
	},
};

export const Secondary: Story = {
	args: {
		color: 'secondary',
	},
};

export const Success: Story = {
	args: {
		color: 'success',
	},
};

export const ErrorColor: Story = {
	args: {
		color: 'error',
	},
};

export const WithCustomIcon: Story = {
	args: {
		icon: <ChevronsUp data-slot="icon" />,
	},
};

export const WithDifferentIcon: Story = {
	args: {
		icon: <MoveUp data-slot="icon" />,
		variant: 'tonal',
		color: 'secondary',
	},
};

export const WithChevronIcon: Story = {
	args: {
		icon: <ChevronUp data-slot="icon" />,
		variant: 'outlined',
		color: 'info',
	},
};

export const LowThreshold: Story = {
	args: {
		threshold: 100,
	},
	parameters: {
		docs: {
			description: {
				story: 'Button appears after scrolling only 100px',
			},
		},
	},
};

export const InstantScroll: Story = {
	args: {
		behavior: 'instant',
	},
	parameters: {
		docs: {
			description: {
				story: 'Scrolls to top instantly without animation',
			},
		},
	},
};

export const AllVariants: Story = {
	parameters: {
		layout: 'fullscreen',
	},
	render: () => (
		<div className="h-max overflow-auto">
			<div className="max-h-[648px] p-8 relative">
				<h1 className="text-4xl font-bold mb-8">All Variants</h1>
				<div className="grid grid-cols-3 gap-4 mb-8">
					<div className="space-y-2">
						<h3 className="font-semibold">Filled</h3>
						<div className="flex gap-2">
							<ScrollToTop variant="filled" color="primary" />
							<ScrollToTop variant="filled" color="secondary" />
							<ScrollToTop variant="filled" color="success" />
						</div>
					</div>
					<div className="space-y-2">
						<h3 className="font-semibold">Tonal</h3>
						<div className="flex gap-2">
							<ScrollToTop variant="tonal" color="primary" />
							<ScrollToTop variant="tonal" color="secondary" />
							<ScrollToTop variant="tonal" color="success" />
						</div>
					</div>
					<div className="space-y-2">
						<h3 className="font-semibold">Outlined</h3>
						<div className="flex gap-2">
							<ScrollToTop variant="outlined" color="primary" />
							<ScrollToTop variant="outlined" color="secondary" />
							<ScrollToTop variant="outlined" color="success" />
						</div>
					</div>
				</div>
				<div className="space-y-4">
					{Array.from({ length: 30 }).map((_, i) => (
						<div
							key={i}
							className="p-4 border rounded-lg bg-card text-card-foreground"
						>
							<p className="text-lg font-medium">Section {i + 1}</p>
							<p className="text-sm text-muted-foreground">
								Scroll down to test multiple scroll-to-top buttons at once
							</p>
						</div>
					))}
				</div>

				<ScrollToTop
					className="absolute bottom-0 right-0"
					variant="filled"
					color="primary"
				/>
			</div>
		</div>
	),
};
