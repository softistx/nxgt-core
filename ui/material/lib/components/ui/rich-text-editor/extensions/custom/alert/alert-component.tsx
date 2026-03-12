import type { ReactNodeViewProps } from '@tiptap/react';
import {
	NodeViewContent,
	NodeViewWrapper,
	useEditorState,
} from '@tiptap/react';
import { Info } from 'lucide-react';
import { cn } from '../../../../../../lib/utils';
import { Alert, Button } from '../../../../..';
import { ALERT_EXTENSION_ID } from './const';

export function AlertComponent(props: ReactNodeViewProps<HTMLLabelElement>) {
	const increase = () => {
		props.updateAttributes({
			count: props.node.attrs.count + 1,
		});
	};

	const state = useEditorState({
		editor: props.editor,
		selector(context) {
			return { active: context.editor.can().deleteNode(ALERT_EXTENSION_ID) };
		},
	});

	return (
		<NodeViewWrapper className={cn(ALERT_EXTENSION_ID)}>
			<Alert
				variant={state.active ? 'success' : 'info'}
				icon={<Info />}
				className="m-2"
				title={
					<span contentEditable={false}>
						{props.node.attrs.title ?? 'Alert component'}
					</span>
				}
				description={
					<div className="grid">
						<NodeViewContent
							className="bg-info/5 size-full min-h-8"
							content="AAA"
						/>
						<Button onClick={increase}>
							This button has been clicked {props.node.attrs.count} times.
						</Button>
					</div>
				}
			></Alert>
		</NodeViewWrapper>
	);
}
