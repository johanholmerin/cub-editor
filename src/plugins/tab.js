import {
  orderedSelection,
  replaceSelection,
  getNewState,
  serializeState
} from '../core/shared.js';

const INDENTABLE_BLOCKS = [
  'todo_item',
  'ordered_list_item',
  'unordered_list_item'
];

const INDENTATION = /^\t| {0,4}/;

function shouldIndent(blocks) {
  return blocks.some(block => INDENTABLE_BLOCKS.includes(block.type));
}

export default function tabPlugin() {
  return {
    handlers: {
      keydown(editor, event) {
        // Tab
        if (event.which !== 9) return;

        if (
          event.metaKey ||
          event.ctrlKey
        ) return false;

        event.preventDefault();

        const {
          firstBlock,
          lastBlock
        } = orderedSelection(editor.selection);

        const selectedBlocks = editor.state.slice(firstBlock, lastBlock + 1);

        if (event.altKey || !shouldIndent(selectedBlocks)) {
          replaceSelection(editor, '\t');
        } else {
          const {
            anchorBlock,
            focusBlock,
            anchorOffset,
            focusOffset
          } = editor.selection;

          const offsetChange = event.shiftKey ? -1 : 1;
          const text = selectedBlocks.map(block => {
            const text = serializeState(block.content);

            if (event.shiftKey) return text.replace(INDENTATION, '');
            return '\t' + text;
          }).join('\n');
          editor.update(
            getNewState(editor, firstBlock, lastBlock, text),
            {
              anchor: [anchorBlock, anchorOffset + offsetChange],
              focus: [focusBlock, focusOffset + offsetChange]
            }
          );
        }

        return true;
      }
    }
  };
}
