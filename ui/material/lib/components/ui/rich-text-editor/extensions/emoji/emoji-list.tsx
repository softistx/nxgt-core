import type { EmojiItem } from '@tiptap/extension-emoji';
import _ from 'lodash';
import {
	Activity,
	Box,
	Clock,
	Flag,
	Globe,
	LayoutGrid,
	Leaf,
	Package,
	Puzzle,
	Sparkles,
	User,
	Utensils,
} from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { useLocalStorage } from 'react-use';
import {
	Separator,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from '../../../..';
import type { EMOJI_I18N_KEYS } from './consts';

const RECENT_EMOGIS_KEY = 'recent-emojis';

const icons = {
	all: LayoutGrid,
	recent: Clock,
	general: Box,
	people_body: User,
	components: Puzzle,
	animals_nature: Leaf,
	food_drink: Utensils,
	travel_places: Globe,
	activities: Activity,
	objects: Package,
	symbols: Sparkles,
	flags: Flag,
};

export const EmojiList = ({
	emojis,
	onSelect,
}: {
	labels?: (typeof EMOJI_I18N_KEYS)['en'];
	emojis: EmojiItem[];
	onSelect: (value: string) => void;
}) => {
	const [recent, setRecent] = useLocalStorage<string[]>(RECENT_EMOGIS_KEY, []);

	const handleEmojiUpdate = useCallback(
		(emojiName: string) => () => {
			onSelect(emojiName);
			setRecent((prev) => {
				const updated = [
					emojiName,
					...(prev?.filter((name) => name !== emojiName) ?? []),
				];
				return updated.slice(0, 20);
			});
		},
		[onSelect, setRecent],
	);

	const groups = useMemo(
		() => ({
			all: emojis,
			recent: emojis.filter((emoji) => recent?.includes(emoji.name)),
			general: emojis.filter((emoji) => !emoji.group),
			..._.transform(
				emojis,
				(acc: Record<string, (typeof emojis)[0][]>, curr) => {
					if (curr.group) {
						const key = curr.group.replace(' & ', '_');
						acc[key] = [...(acc[key] ?? []), curr];
					}
					return acc;
				},
			),
		}),
		[emojis, recent],
	);

	useEffect(() => {
		console.log(Object.keys(groups));
	}, [groups]);

	return (
		<div className="flex flex-col gap-4 max-h-[300px] overflow-y-auto">
			<Tabs defaultValue="all">
				<TabsList>
					{Object.keys(groups)
						.map((group) => ({
							group: group as keyof typeof icons,
							icon: icons[group as keyof typeof icons],
						}))
						.map((item) => (
							<TabsTrigger
								key={item.group}
								value={item.group}
								className="w-max"
							>
								<item.icon />
							</TabsTrigger>
						))}
				</TabsList>
				{Object.entries(groups).map(([group, emojis]) => (
					<TabsContent key={group} value={group} className="w-full">
						<div className="flex flex-wrap gap-2 w-full overflow-auto min-h-48 h-[250px] p-4">
							{emojis.map((emoji) => (
								<button
									key={`${group}-${emoji.name}`}
									type="button"
									className="cursor-pointer size-4 border-none bg-transparent p-0 hover:bg-muted rounded"
									onClick={handleEmojiUpdate(emoji.name)}
									aria-label={`Insert ${emoji.name} emoji`}
								>
									{emoji.emoji}
								</button>
							))}
						</div>
						<Separator />
					</TabsContent>
				))}
			</Tabs>
		</div>
	);
};
