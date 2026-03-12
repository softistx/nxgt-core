import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { AlertComponent } from './alert-component';
import { ALERT_EXTENSION_ID } from './const';

export const AlertExtension = Node.create({
	name: ALERT_EXTENSION_ID,
	group: 'block',
	atom: true,
	addAttributes() {
		return {
			count: {
				default: 0,
			},
		};
	},
	parseHTML() {
		return [
			{
				tag: ALERT_EXTENSION_ID,
			},
		];
	},
	renderHTML({ HTMLAttributes }) {
		return [ALERT_EXTENSION_ID, mergeAttributes(HTMLAttributes)];
	},
	addNodeView() {
		return ReactNodeViewRenderer(AlertComponent);
	},
});
