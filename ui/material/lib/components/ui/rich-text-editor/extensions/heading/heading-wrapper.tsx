import { type Editor, useEditorState } from '@tiptap/react';
import {
	Heading,
	Heading1,
	Heading2,
	Heading3,
	Heading4,
	Heading5,
	Heading6,
} from 'lucide-react';
import type { JSX } from 'react';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
	IconButton,
} from '../../../..';

const headingIcons = {
	1: <Heading1 />,
	2: <Heading2 />,
	3: <Heading3 />,
	4: <Heading4 />,
	5: <Heading5 />,
	6: <Heading6 />,
} as Record<number, JSX.Element>;

export function HeadingWrapper({ editor }: { editor: Editor }) {
	const editorState = useEditorState({
		editor,
		selector: (ctx) => {
			return {
				isHeading: (level: number) =>
					ctx.editor.isActive('heading', { level }) ?? false,
			};
		},
	});
	return (
		<HoverCard>
			<HoverCardTrigger className="*:size-7">
				<IconButton
					variant={
						Array.from({ length: 6 }).some((_, index) =>
							editorState.isHeading(index + 1),
						)
							? 'filled'
							: 'ghost'
					}
					className="rounded"
				>
					<Heading />
				</IconButton>
			</HoverCardTrigger>
			<HoverCardContent className="flex p-1 gap-2 w-max shadow rounded *:size-7">
				{Array.from({ length: 6 }).map((_, index) => (
					<IconButton
						key={`heading-${index + 1}`}
						variant={editorState.isHeading(index + 1) ? 'filled' : 'ghost'}
						value={(index + 1).toString()}
						onClick={() =>
							editor
								.chain()
								.focus()
								.toggleHeading({ level: (index + 1) as any })
								.run()
						}
						className={'rounded'}
					>
						{headingIcons[index + 1] || <Heading1 />}
					</IconButton>
				))}
			</HoverCardContent>
		</HoverCard>
	);
}
