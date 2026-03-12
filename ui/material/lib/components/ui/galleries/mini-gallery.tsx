import { X } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { cn } from '../../../lib/utils';
import { IconButton } from '../buttons/icon-button';

export type MiniGalleryItem = {
	id: string;
	src: string;
	alt?: string;
	title?: string;
	metadata?: Record<string, any>;
};

export type MiniGalleryProps = {
	items: MiniGalleryItem[];
	onDelete?: (item: MiniGalleryItem) => void;
	className?: string;
	itemClassName?: string;
	showTitles?: boolean;
	size?: 'xs' | 'sm' | 'md' | 'lg';
	gap?: 'xs' | 'sm' | 'md';
	maxItems?: number;
	showMoreIndicator?: boolean;
} & ComponentProps<'div'>;

const sizeClasses = {
	xs: 'size-12',
	sm: 'size-16',
	md: 'size-20',
	lg: 'size-24',
};

const gapClasses = {
	xs: 'gap-1',
	sm: 'gap-2',
	md: 'gap-3',
};

export function MiniGallery({
	items,
	onDelete,
	className,
	itemClassName,
	showTitles = false,
	size = 'md',
	gap = 'sm',
	maxItems,
	showMoreIndicator = true,
	...props
}: MiniGalleryProps) {
	const [hoveredItem, setHoveredItem] = useState<string | null>(null);
	const displayItems = maxItems ? items.slice(0, maxItems) : items;
	const hasMore = maxItems && items.length > maxItems;

	return (
		<div
			className={cn('flex flex-wrap items-center', gapClasses[gap], className)}
			{...props}
		>
			{displayItems.map((item) => (
				<div
					key={item.id}
					role="img"
					aria-label={item.alt || item.title || 'Gallery item'}
					className={cn(
						'group relative rounded-lg overflow-hidden transition-all duration-200 hover:scale-105',
						sizeClasses[size],
						itemClassName,
					)}
					onMouseEnter={() => setHoveredItem(item.id)}
					onMouseLeave={() => setHoveredItem(null)}
				>
					<img
						src={item.src}
						alt={item.alt || item.title || 'Gallery item'}
						className="w-full h-full object-cover"
						loading="lazy"
					/>

					{/* Delete button overlay */}
					{onDelete && hoveredItem === item.id && (
						<div className="absolute inset-0 bg-black/60 flex center">
							<IconButton
								variant="filled"
								color="error"
								onClick={(e) => {
									e.stopPropagation();
									onDelete(item);
								}}
								className="size-5"
								aria-label={`Delete ${item.title || item.alt || 'item'}`}
							>
								<X className="size-3" />
							</IconButton>
						</div>
					)}

					{/* Title tooltip on hover */}
					{showTitles && item.title && hoveredItem === item.id && (
						<div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black/80 text-white text-xs rounded whitespace-nowrap z-10">
							{item.title}
						</div>
					)}
				</div>
			))}

			{/* More indicator */}
			{hasMore && showMoreIndicator && (
				<div
					className={cn(
						'flex center bg-muted rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-xs font-medium',
						sizeClasses[size],
					)}
				>
					+{items.length - maxItems}
				</div>
			)}
		</div>
	);
}
