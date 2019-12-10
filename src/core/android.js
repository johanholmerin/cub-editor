import { getChangeIndexes, getText } from './shared.js';
import { android } from './user-agent.js';

function onInput(editor, event) {
  const { firstBlockIndex } = getChangeIndexes(editor, event);
  const firstBlock = editor.element.children[firstBlockIndex];

  const caretStart = event.target === editor.element ?
    editor.selection.anchorOffset :
    -1;

  // While composing, only update if block type changes
  const block = editor.parser(getText(firstBlock), true).next().value;
  if (editor.composing && block.type === firstBlock.type) return;

  // Update entire document
  const text = Array.from(editor.element.children)
    .map(child => getText(child)).join('\n');
  editor.update(
    Array.from(editor.parser(text)),
    [firstBlockIndex, caretStart]
  );

  return false;
}

/**
 * Can't be cancelled on android. Prevent default handler from being called
 */
function onBeforeInput() {
  return true;
}

function onCompositionEnd(editor, event) {
  editor.composing = false;

  // Don't update while selecting text
  const { isCollapsed } = editor.element.getRootNode().getSelection();
  if (isCollapsed) onInput(editor, event);

  return true;
}

export default android && {
  handlers: {
    input: onInput,
    beforeinput: onBeforeInput,
    compositionend: onCompositionEnd
  }
};
