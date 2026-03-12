import { computePosition, flip, shift } from '@floating-ui/dom';
import type {
	MentionNodeAttrs,
	MentionOptions,
} from '@tiptap/extension-mention';
import { type Editor, posToDOMRect, ReactRenderer } from '@tiptap/react';
import { MentionList } from './mention-list';

const updatePosition = (editor: Editor, element: HTMLElement) => {
	const virtualElement = {
		getBoundingClientRect: () =>
			posToDOMRect(
				editor.view,
				editor.state.selection.from,
				editor.state.selection.to,
			),
	};

	computePosition(virtualElement, element, {
		placement: 'bottom-start',
		strategy: 'absolute',
		middleware: [shift(), flip()],
	}).then(({ x, y, strategy }) => {
		element.style.width = 'max-content';
		element.style.position = strategy;
		element.style.left = `${x}px`;
		element.style.top = `${y}px`;
	});
};

export const suggestion: (
	items: string[],
) => MentionOptions<any, MentionNodeAttrs>['suggestion'] = (items) => ({
	items: ({ query }) => {
		return items
			.filter((item) => item.toLowerCase().startsWith(query.toLowerCase()))
			.slice(0, 5);
	},

	render: () => {
		let component: ReactRenderer;

		return {
			onStart: (props) => {
				component = new ReactRenderer(MentionList, {
					props,
					editor: props.editor,
				});

				if (!props.clientRect) {
					return;
				}

				(component.element as HTMLElement).style.position = 'absolute';

				document.body.appendChild(component.element);

				updatePosition(props.editor, component.element as HTMLElement);
			},

			onUpdate(props) {
				component.updateProps(props);

				if (!props.clientRect) {
					return;
				}

				updatePosition(props.editor, component.element as HTMLElement);
			},

			onKeyDown(props) {
				if (props.event.key === 'Escape') {
					component.destroy();

					return true;
				}

				return (component.ref as any)?.onKeyDown(props);
			},

			onExit() {
				component.element.remove();
				component.destroy();
			},
		};
	},
});
