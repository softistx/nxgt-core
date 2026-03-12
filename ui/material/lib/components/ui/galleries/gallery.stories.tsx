import type { Meta, StoryObj } from '@storybook/react';
import { Gallery, type GalleryItem } from '../..';

const meta = {
	title: 'Media/Gallery',
	component: Gallery,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof Gallery>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample gallery items
const sampleItems: GalleryItem[] = [
	{
		id: '1',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=400&h=400&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'Mountain landscape',
		title: 'Mountain View',
		description: 'Beautiful mountain landscape with snow-capped peaks',
	},
	{
		id: '2',
		src: 'https://plus.unsplash.com/premium_photo-1661777965336-e4e80856b9fe?w=400&h=400&fit=crop',
		thumbnail:
			'https://plus.unsplash.com/premium_photo-1661777965336-e4e80856b9fe?w=200&h=200&fit=crop',
		alt: 'Forest path',
		title: 'Forest Path',
		description: 'Serene forest path with autumn colors',
	},
	{
		id: '3',
		src: 'https://plus.unsplash.com/premium_photo-1661540638251-a8e663bf45f8?w=400&h=400&fit=crop',
		thumbnail:
			'https://plus.unsplash.com/premium_photo-1661540638251-a8e663bf45f8?w=200&h=200&fit=crop',
		alt: 'Ocean waves',
		title: 'Ocean Waves',
		description: 'Powerful ocean waves crashing on the shore',
	},
	{
		id: '4',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=400&h=400&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'Desert sunset',
		title: 'Desert Sunset',
		description: 'Stunning desert sunset with golden hues',
	},
	{
		id: '5',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=400&h=400&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'City skyline',
		title: 'City Skyline',
		description: 'Modern city skyline at dusk',
	},
	{
		id: '6',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=400&h=400&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'Another mountain',
		title: 'Alpine Peaks',
		description: 'Majestic alpine peaks in the distance',
	},
];

export const Default: Story = {
	args: {
		items: sampleItems,
		columns: 3,
		gap: 'md',
		showTitles: true,
		showDescriptions: true,
	},
};

export const Portrait: Story = {
	args: {
		items: sampleItems,
		columns: 4,
		aspectRatio: 'portrait',
		gap: 'lg',
		showTitles: true,
	},
};

export const Landscape: Story = {
	args: {
		items: sampleItems,
		columns: 2,
		aspectRatio: 'landscape',
		gap: 'md',
		showTitles: true,
		showDescriptions: true,
	},
};

export const WithDelete: Story = {
	args: {
		items: sampleItems,
		columns: 3,
		gap: 'md',
		showTitles: true,
		onDelete: (item) => alert(`Delete item: ${item.title}`),
	},
};

export const Compact: Story = {
	args: {
		items: sampleItems,
		columns: 4,
		gap: 'sm',
		showTitles: false,
		showDescriptions: false,
	},
};
