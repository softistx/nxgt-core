import { ChevronLeft, ChevronRight, Plus, Trash, X } from 'lucide-react';
import {
	type ComponentProps,
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import { cn } from '../../../lib/utils';
import { IconButton } from '../buttons/icon-button';
import { Dialog, DialogContent, DialogTrigger } from '../dialog';
import { Typography } from '../typography';

export type LightboxGalleryItem = {
	id: string;
	src: string;
	thumbnail?: string;
	alt?: string;
	title?: string;
	description?: string;
	metadata?: Record<string, any>;
};

export type LightboxGalleryProps = {
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	items: LightboxGalleryItem[];
	trigger?: React.ReactNode;
	className?: string;
	showThumbnails?: boolean;
	showNavigation?: boolean;
	showInfo?: boolean;
	startIndex?: number;
	onDelete?: (item: LightboxGalleryItem) => void;
	header?: ReactNode;
	footer?: ReactNode;
	subheader?: ReactNode;
	onFileChange?: (files: FileList) => void;
} & ComponentProps<'div'>;

export function LightboxGallery({
	items,
	trigger,
	className,
	showThumbnails = true,
	showNavigation = true,
	showInfo = true,
	startIndex = 0,
	onDelete,
	header,
	footer,
	subheader,
	onFileChange,
	open = false,
	onOpenChange,
}: LightboxGalleryProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [currentIndex, setCurrentIndex] = useState(startIndex);

	const currentItem = items[currentIndex];

	const goToPrevious = useCallback(() => {
		setCurrentIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
	}, [items.length]);

	const goToNext = useCallback(() => {
		setCurrentIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
	}, [items.length]);

	const goToIndex = useCallback((index: number) => {
		setCurrentIndex(index);
	}, []);

	// Handle keyboard navigation
	useEffect(() => {
		if (!isOpen) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			switch (e.key) {
				case 'ArrowLeft':
					goToPrevious();
					break;
				case 'ArrowRight':
					goToNext();
					break;
				case 'Escape':
					setIsOpen(false);
					break;
			}
		};

		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [isOpen, goToNext, goToPrevious]);

	useEffect(() => {
		setIsOpen(open);
	}, [open]);

	const handleClose = useCallback(() => setIsOpen(false), []);

	const handleDelete = useCallback(() => {
		if (onDelete && currentItem) {
			onDelete(currentItem);
			// After deletion, close the lightbox or adjust the index
			if (items.length === 1) {
				setIsOpen(false);
			} else {
				setCurrentIndex((prev) => (prev > 0 ? prev - 1 : 0));
			}
		}
	}, [onDelete, currentItem, items.length]);

	const fileRef = useRef<HTMLInputElement>(null);

	const handleFilesChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const files = e.target.files;
			if (files && files.length > 0 && onFileChange) {
				onFileChange(files);
			}
		},
		[onFileChange],
	);

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange || setIsOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>

			<DialogContent
				className={cn(
					'max-w-full max-h-[728px] min-h-40 w-full p-0 border-none rounded-sm sm:max-w-2xl',
					className,
				)}
			>
				<div className="relative size-full flex flex-col bg-background">
					{/* Header with close button */}
					<div className="absolute flex top-4 right-4 z-50 gap-2">
						{onFileChange && (
							<IconButton
								variant="tonal"
								color="primary"
								onClick={() => {
									fileRef.current?.click();
								}}
								aria-label="Upload image"
							>
								<Plus className="size-6" />
								<input
									type="file"
									accept="image/*"
									multiple
									hidden
									ref={fileRef}
									onChange={handleFilesChange}
								/>
							</IconButton>
						)}
						<IconButton
							variant="tonal"
							color="error"
							onClick={handleClose}
							aria-label="Close lightbox"
						>
							<X className="size-6" />
						</IconButton>
					</div>

					{/* Main image */}
					{currentItem && (
						<div className="flex-1 flex flex-col items-center items-center size-full p-4">
							<div className="flex-1 flex relative mt-32 group">
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
									className="object-fill rounded-sm aspect-video"
								/>
								{showThumbnails && items.length > 1 && (
									<div
										className={cn(
											'absolute w-full bottom-2 left-1/2 -translate-x-1/2 flex justify-center gap-2 p-2',
											'bg-primary/50 rounded-lg max-w-[90%] overflow-x-auto  opacity-0 group-hover:opacity-100',
										)}
									>
										{items.map((item, index) => (
											<button
												key={item.id}
												type="button"
												onClick={() => goToIndex(index)}
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
													className="size-full object-cover"
												/>
											</button>
										))}
									</div>
								)}
								{/* Navigation arrows */}
								{showNavigation && items.length > 1 && (
									<>
										<IconButton
											variant="tonal"
											onClick={goToPrevious}
											className="absolute left-4 top-1/2 -translate-y-1/2 text-white size-12  opacity-0 group-hover:opacity-100"
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
							{showInfo &&
								(currentItem.title ||
									currentItem.description ||
									header ||
									subheader ||
									footer) && (
									<div className="@container grid w-full bg-gradient-to-t from-primary/80 to-transparent p-2 gap-4 text-white rounded-xs">
										{currentItem.title ||
											currentItem.description ||
											header ||
											(subheader && (
												<div className="max-w-4xl mx-auto p-4">
													{(currentItem.title || header) && (
														<Typography
															variant={'title-small'}
															className="text-xl font-semibold mb-2"
														>
															{currentItem.title || header}
														</Typography>
													)}
													{(currentItem.description || subheader) && (
														<div className="text-slate-200">
															{currentItem.description || subheader}
														</div>
													)}
												</div>
											))}
										{footer && (
											<div className="bg-background/60 flex h-min gap-2 justify-end items-center rounded-md p-2">
												{footer}
											</div>
										)}
									</div>
								)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
