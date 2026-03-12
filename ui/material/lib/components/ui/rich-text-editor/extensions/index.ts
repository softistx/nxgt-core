import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Emoji, { emojis } from '@tiptap/extension-emoji';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Mention } from '@tiptap/extension-mention';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import type { RichTextEditorProps } from '../rich-text-editor';
import { lowlight } from './code';
import { AlertExtension } from './custom';
import { suggestion } from './mention';

export const extensions = (options: RichTextEditorProps['options']) => [
	AlertExtension,
	TextStyleKit,
	StarterKit.configure({
		codeBlock: false,
	}),
	TaskList,
	TaskItem.configure({ nested: true }),
	Emoji.configure({
		emojis,
		enableEmoticons: true,
	}),
	TableKit.configure({
		table: { resizable: true },
	}),
	CodeBlockLowlight.configure({ lowlight }),
	...(options?.mentions?.suggestions
		? [
				Mention.configure({
					HTMLAttributes: {
						class: 'text-primary p-1 hover:text-primary/80 cursor-pointer',
					},
					suggestion: suggestion(options.mentions.suggestions),
				}),
			]
		: []),
];
