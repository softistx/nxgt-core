import { useEffect, useImperativeHandle, useState } from 'react';
import { cn } from '../../../../../lib/utils';
import { Avatar, Button, Typography } from '../../../..';

export function MentionList(props: any) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const selectItem = (index: number) => {
		const item = props.items[index];

		if (item) {
			props.command({ id: item });
		}
	};

	const upHandler = () => {
		setSelectedIndex(
			(selectedIndex + props.items.length - 1) % props.items.length,
		);
	};

	const downHandler = () => {
		setSelectedIndex((selectedIndex + 1) % props.items.length);
	};

	const enterHandler = () => {
		selectItem(selectedIndex);
	};

	useEffect(() => setSelectedIndex(0), []);

	useImperativeHandle(props.ref, () => ({
		onKeyDown: ({ event }: { event: KeyboardEvent }) => {
			if (event.key === 'ArrowUp') {
				upHandler();
				return true;
			}

			if (event.key === 'ArrowDown') {
				downHandler();
				return true;
			}

			if (event.key === 'Enter') {
				enterHandler();
				return true;
			}

			return false;
		},
	}));

	return (
		<div
			className={cn(
				'grid max-w-sm min-w-[220px] gap-1 p-2 bg-background rounded shadow',
			)}
		>
			{props.items.length ? (
				props.items.map((item: string, index: number) => (
					<Button
						className={cn('w-full rounded justify-start px-2 py-1', {
							'': index === selectedIndex,
						})}
						variant={index === selectedIndex ? 'tonal' : 'ghost'}
						key={`item-${index.toString()}`}
						onClick={() => selectItem(index)}
					>
						<Avatar fallback={item?.[0]} />
						{item}
					</Button>
				))
			) : (
				<Typography variant={'title-small'} className="text-muted-foreground">
					No result
				</Typography>
			)}
		</div>
	);
}
