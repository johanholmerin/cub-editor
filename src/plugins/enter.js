import {
  serializeState,
  orderedSelection,
  replaceSelection
} from '../core/shared.js';

const PREFIXES = {
  blockquote: '> ',
  unordered_list_item: '* ',
  ordered_list_item: str => `${parseInt(str) + 1}. `,
  todo_item: '- [ ] '
};

const EMPTY_LENGTHS = {
  blockquote: 2,
  unordered_list_item: 3,
  ordered_list_item: 4,
  todo_item: 3
};

function getPrefix(block) {
  if (!Object.keys(PREFIXES).includes(block.type)) return '';

  // No indentation
  if (block.type === 'blockquote') return PREFIXES.blockquote;

  const text = typeof PREFIXES[block.type] === 'function' ?
    PREFIXES[block.type](block.content[1]) :
    PREFIXES[block.type];

  return block.content[0] + text;
}

function shouldRemoveBlock(block) {
  const len = EMPTY_LENGTHS[block.type];
  return block.content.length === len && block.content[len - 1] === ' ';
}

export default function enterPlugin() {
  return {
    handlers: {
      keypress(editor, event) {
        // Enter
        if (event.which !== 13) return;

        event.preventDefault();

        const { firstBlock, firstOffset } = orderedSelection(editor.selection);
        const firstLine = serializeState(editor.state[firstBlock].content);
        const { isCollapsed } = editor.element.getRootNode().getSelection();

        // Remove empty block
        if (
          isCollapsed &&
          firstOffset === firstLine.length &&
          Object.keys(PREFIXES).includes(editor.state[firstBlock].type) &&
          shouldRemoveBlock(editor.state[firstBlock])
        ) {
          editor.update([
            ...editor.state.slice(0, firstBlock),
            // Generate block from empty line
            editor.parser('').next().value,
            ...editor.state.slice(firstBlock + 1)
          ], [firstBlock, 0]);

          return true;
        }

        const prefix = event.shiftKey || event.altKey || event.ctrlKey ?
          '' : getPrefix(editor.state[firstBlock]);
        replaceSelection(editor, '\n' + prefix);

        return true;
      }
    }
  };
}
