import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { RichTextEditor } from '../..';

const meta = {
	title: 'Media/RichTextEditor',
	component: RichTextEditor,
	parameters: {
		layout: 'centered',
	},
	tags: ['autodocs'],
	argTypes: {
		editable: { control: { type: 'boolean' } },
	},
	args: {},
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	render: function Component(props) {
		const [content, setContent] = useState(`
        <h2>
          Hi there,
        </h2>
        <p>
          this is a <em>basic</em> example of <strong>Tiptap</strong>. Sure, there are all kind of basic text styles you’d probably expect from a text editor. But wait until you see the lists:
        </p>
        <alert-component>
          <p>This is editable. You can create a new component by pressing Mod+Enter.</p>
        </alert-component>
        <ul>
          <li>
            That’s a bullet list with one …
          </li>
          <li>
            … or two list items.
          </li>
        </ul>
        <ol>
          <li>
            That’s a bullet list with one …
          </li>
          <li>
            … or two list items.
          </li>
        </ol>
        <p>
          Isn’t that great? And all of that is editable. But wait, there’s more. Let’s try a code block:
        </p>
        <pre><code class="language-css">body { display: none; }</code></pre>
        <p>
          I know, I know, this is impressive. It’s only the tip of the iceberg though. Give it a try and click a little bit around. Don’t forget to check the other examples too.
        </p>
        <blockquote>
          Wow, that’s amazing. Good work, boy! 👏
          <br />
          — Mom
        </blockquote>
    `);
		return (
			<RichTextEditor
				label={'Description'}
				helperText={'Provide brief description of the article'}
				content={content}
				editable={props.editable}
				onUpdate={(props) => {
					setContent(props.editor.getHTML());
				}}
				options={{
					mentions: {
						suggestions: [
							'Lea Thompson',
							'Cyndi Lauper',
							'Tom Cruise',
							'Madonna',
							'Jerry Hall',
							'Joan Collins',
							'Winona Ryder',
							'Christina Applegate',
							'Alyssa Milano',
							'Molly Ringwald',
							'Ally Sheedy',
							'Debbie Harry',
							'Olivia Newton-John',
							'Elton John',
							'Michael J. Fox',
							'Axl Rose',
							'Emilio Estevez',
							'Ralph Macchio',
							'Rob Lowe',
							'Jennifer Grey',
							'Mickey Rourke',
							'John Cusack',
							'Matthew Broderick',
							'Justine Bateman',
							'Lisa Bonet',
						],
					},
				}}
			/>
		);
	},
};
