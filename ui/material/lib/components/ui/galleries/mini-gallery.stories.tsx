import type { Meta, StoryObj } from '@storybook/react';
import { MiniGallery, type MiniGalleryItem } from '../..';

const meta = {
	title: 'Media/MiniGallery',
	component: MiniGallery,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof MiniGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample mini gallery items
const sampleItems: MiniGalleryItem[] = [
	{
		id: '1',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Mountain landscape',
		title: 'Mountain View',
	},
	{
		id: '2',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Forest path',
		title: 'Forest Path',
	},
	{
		id: '3',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Ocean waves',
		title: 'Ocean Waves',
	},
	{
		id: '4',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Desert sunset',
		title: 'Desert Sunset',
	},
	{
		id: '5',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'City skyline',
		title: 'City Skyline',
	},
	{
		id: '6',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Another mountain',
		title: 'Alpine Peaks',
	},
	{
		id: '7',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Another forest',
		title: 'Forest Trail',
	},
	{
		id: '8',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=100&h=100&fit=crop',
		alt: 'Another ocean',
		title: 'Coastal View',
	},
];

export const Default: Story = {
	args: {
		items: sampleItems,
		size: 'md',
		gap: 'sm',
		showTitles: true,
	},
};

export const Small: Story = {
	args: {
		items: sampleItems,
		size: 'sm',
		gap: 'xs',
		showTitles: true,
	},
};

export const Large: Story = {
	args: {
		items: sampleItems,
		size: 'lg',
		gap: 'md',
		showTitles: true,
	},
};

export const WithDelete: Story = {
	args: {
		items: sampleItems,
		size: 'md',
		gap: 'sm',
		showTitles: true,
		onDelete: (item) => alert(`Delete item: ${item.title}`),
	},
};

export const Limited: Story = {
	args: {
		items: sampleItems,
		size: 'md',
		gap: 'sm',
		showTitles: true,
		maxItems: 5,
		showMoreIndicator: true,
	},
};

export const NoTitles: Story = {
	args: {
		items: sampleItems,
		size: 'md',
		gap: 'sm',
		showTitles: false,
	},
};
