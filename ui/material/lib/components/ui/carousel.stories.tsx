import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent } from './card';
import {
	Carousel,
	CarouselContent,
	CarouselItem,
	CarouselNext,
	CarouselPrevious,
} from './carousel';

const meta = {
	title: 'Media/Carousel',
	component: Carousel,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
} satisfies Meta<typeof Carousel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {},
	render: function Component(props) {
		return (
			<Carousel
				{...props}
				opts={{
					align: 'start',
				}}
				className="w-full max-w-sm"
			>
				<CarouselContent>
					{Array.from({ length: 5 }).map((_, index) => (
						<CarouselItem
							key={`item-${index.toString()}`}
							className="md:basis-1/2 lg:basis-1/3"
						>
							<div className="p-1">
								<Card>
									<CardContent className="flex aspect-square center p-6">
										<span className="text-3xl font-semibold">{index + 1}</span>
									</CardContent>
								</Card>
							</div>
						</CarouselItem>
					))}
				</CarouselContent>
				<CarouselPrevious />
				<CarouselNext />
			</Carousel>
		);
	},
};
