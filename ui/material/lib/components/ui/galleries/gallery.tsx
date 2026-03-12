import { ChevronLeft, ChevronRight, Trash } from 'lucide-react';
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useState,
} from 'react';
import { cn } from '../../../lib/utils';
import { Background } from '../background';
import { IconButton } from '../buttons/icon-button';
import { Typography } from '../typography';

export type GalleryItem = {
	id: string;
	src: string;
	thumbnail?: string;
	alt?: string;
	title?: string;
	description?: string;
	metadata?: Record<string, any>;
};

export type GalleryProps = {
	items: GalleryItem[];
	onDelete?: (item: GalleryItem) => void;
	className?: string;
	itemClassName?: string;
	showTitles?: boolean;
	showDescriptions?: boolean;
	showThumbnails?: boolean;
	aspectRatio?: 'square' | 'video' | 'portrait' | 'landscape' | 'auto';
	gap?: 'sm' | 'md' | 'lg';
	columns?: number;
	maxHeight?: string;
	header?: ReactNode;
	subheader?: ReactNode;
} & ComponentProps<'div'>;

const gapClasses = {
	sm: 'gap-2',
	md: 'gap-4',
	lg: 'gap-6',
};

export function Gallery({
	items,
	onDelete,
	className,
	itemClassName,
	showTitles = true,
	showDescriptions = false,
	aspectRatio = 'square',
	gap = 'md',
	columns = 3,
	maxHeight,
	header,
	subheader,
	showThumbnails = true,
	...props
}: GalleryProps) {
	const [currentIndex, setCurrentIndex] = useState(0);

	const currentItem = items[currentIndex];

	const goToPrevious = useCallback(() => {
		setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
	}, [items.length]);

	const goToNext = useCallback(() => {
		setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
	}, [items.length]);

	const handleIndexChange = useCallback(
		(index: number) => () => {
			setCurrentIndex(index);
		},
		[],
	);

	const handleDelete = useCallback(() => {
		if (onDelete && currentItem) {
			onDelete(currentItem);
			if (items.length > 1) {
				setCurrentIndex((prev) => (prev > 0 ? prev - 1 : 0));
			}
		}
	}, [onDelete, currentItem, items.length]);

	return (
		<div
			className={cn(
				'max-w-max max-h-[95vh] w-full h-full **:transition-all',
				gapClasses[gap],
				className,
			)}
			{...props}
		>
			{currentItem && (
				<Background className="relative w-full h-full flex flex-col bg-slate-700/60 ">
					<div className="flex-1 flex flex-col items-center items-center h-max p-4 w-full">
						<div className="relative mt-8 group">
							{onDelete && currentItem && (
								<IconButton
									color="error"
									onClick={handleDelete}
									className="absolute top-4 right-4 z-50 opacity-0 group-hover:opacity-100"
									aria-label="Delete image"
								>
									<Trash />
								</IconButton>
							)}
							<img
								src={currentItem.src}
								alt={currentItem.alt || currentItem.title}
								className="max-w-full max-h-full object-fill rounded-sm"
							/>
							{showThumbnails && items.length > 1 && (
								<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-2 p-2 bg-primary/50 rounded-lg max-w-[90%] overflow-x-auto opacity-0 group-hover:opacity-100">
									{items.map((item, index) => (
										<button
											key={item.id}
											type="button"
											onClick={handleIndexChange(index)}
											className={cn(
												'flex-shrink-0 size-8 rounded-full border-2 overflow-hidden transition-all hover:scale-105',
												index === currentIndex
													? 'border-white scale-110'
													: 'border-gray-600 hover:border-gray-400',
											)}
										>
											<img
												src={item.thumbnail || item.src}
												alt={item.alt || item.title}
												className="w-full h-full object-cover"
											/>
										</button>
									))}
								</div>
							)}
							{/* Navigation arrows */}
							{items.length > 1 && (
								<>
									<IconButton
										variant="tonal"
										onClick={goToPrevious}
										className="absolute left-4 top-1/2 -translate-y-1/2 text-white size-12 opacity-0 group-hover:opacity-100"
										aria-label="Previous image"
									>
										<ChevronLeft className="size-8" />
									</IconButton>

									<IconButton
										variant="tonal"
										onClick={goToNext}
										className="absolute right-4 top-1/2 -translate-y-1/2 text-white size-12  opacity-0 group-hover:opacity-100"
										aria-label="Next image"
									>
										<ChevronRight className="size-8" />
									</IconButton>
								</>
							)}
						</div>
						{/* Info panel */}
						{(currentItem.title ||
							currentItem.description ||
							header ||
							subheader) && (
							<div className="w-full bg-gradient-to-t from-primary/80 to-transparent p-6 text-white rounded-xs">
								<div className="max-w-4xl mx-auto">
									{(currentItem.title || header) && (
										<Typography
											variant={'title-small'}
											className="text-xl font-semibold mb-2"
										>
											{currentItem.title || header}
										</Typography>
									)}
									{(currentItem.description || subheader) && (
										<div className="text-gray-200">
											{currentItem.description || subheader}
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</Background>
			)}
		</div>
	);
}
