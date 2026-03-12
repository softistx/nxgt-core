import type { Meta, StoryObj } from '@storybook/react';
import { LightboxGallery, type LightboxGalleryItem } from '../..';

const meta = {
	title: 'Media/LightboxGallery',
	component: LightboxGallery,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {},
	args: {},
} satisfies Meta<typeof LightboxGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

// Sample lightbox gallery items
const sampleItems: LightboxGalleryItem[] = [
	{
		id: '1',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=1200&h=800&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'Mountain landscape',
		title: 'Mountain View',
		description:
			'Beautiful mountain landscape with snow-capped peaks and serene valleys',
	},
	{
		id: '2',
		src: 'https://plus.unsplash.com/premium_photo-1661777965336-e4e80856b9fe?w=1200&h=800&fit=crop',
		thumbnail:
			'https://plus.unsplash.com/premium_photo-1661777965336-e4e80856b9fe?w=200&h=200&fit=crop',
		alt: 'Forest path',
		title: 'Forest Path',
		description:
			'Serene forest path with autumn colors and golden sunlight filtering through the trees',
	},
	{
		id: '3',
		src: 'https://plus.unsplash.com/premium_photo-1661540638251-a8e663bf45f8?w=1200&h=800&fit=crop',
		thumbnail:
			'https://plus.unsplash.com/premium_photo-1661540638251-a8e663bf45f8?w=200&h=200&fit=crop',
		alt: 'Ocean waves',
		title: 'Ocean Waves',
		description:
			'Powerful ocean waves crashing on the shore with dramatic clouds in the sky',
	},
	{
		id: '4',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=1200&h=800&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'Desert sunset',
		title: 'Desert Sunset',
		description:
			'Stunning desert sunset with golden hues and dramatic rock formations',
	},
	{
		id: '5',
		src: 'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=1200&h=800&fit=crop',
		thumbnail:
			'https://images.unsplash.com/photo-1505968409348-bd000797c92e?w=200&h=200&fit=crop',
		alt: 'City skyline',
		title: 'City Skyline',
		description:
			'Modern city skyline at dusk with illuminated buildings and urban landscape',
	},
];

export const Default: Story = {
	args: {
		items: sampleItems,
		trigger: (
			<div className="w-64 h-40 bg-muted rounded-lg flex center cursor-pointer hover:bg-muted/80 transition-colors">
				<span className="text-muted-foreground">Click to open gallery</span>
			</div>
		),
		showThumbnails: true,
		showNavigation: true,
		showInfo: true,
		onDelete: (item) => {
			alert(`Delete action triggered for item: ${item.title}`);
		},
	},
};

export const Minimal: Story = {
	args: {
		items: sampleItems,
		trigger: (
			<div className="w-48 h-32 bg-primary/10 rounded-lg flex center cursor-pointer hover:bg-primary/20 transition-colors">
				<span className="text-primary font-medium">Open Gallery</span>
			</div>
		),
		showThumbnails: false,
		showNavigation: true,
		showInfo: false,
		onDelete: (item) => {
			alert(`Delete action triggered for item: ${item.title}`);
		},
	},
};

export const WithImageTrigger: Story = {
	args: {
		items: sampleItems,
		className: 'max-w-2xl w-full',
		trigger: (
			<img
				src={sampleItems[0].thumbnail}
				alt="Gallery preview"
				className="w-64 h-40 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
			/>
		),
		showThumbnails: true,
		showNavigation: true,
		showInfo: true,
		onDelete: (item) => {
			alert(`Delete action triggered for item: ${item.title}`);
		},
	},
};
