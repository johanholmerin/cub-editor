import {
  getChangeIndexes,
  getText,
  findBlockIndex,
  getNewState,
  serializeState,
  orderedSelection,
  replaceSelection
} from './shared.js';

function onCompositionStart(editor) {
  editor.composing = true;
}

function onCompositionEnd(editor, event) {
  editor.composing = false;
  return onInput(editor, event);
}

function onInput(editor, event) {
  if (editor.composing) return;

  const { firstBlockIndex, lastBlockIndex } = getChangeIndexes(editor, event);
  const firstBlock = editor.element.children[firstBlockIndex];

  const caretStart = event.target === editor.element ?
    editor.selection.anchorOffset :
    -1;
  const text = getText(firstBlock);

  editor.update(
    getNewState(editor, firstBlockIndex, lastBlockIndex, text),
    [firstBlockIndex, caretStart]
  );

  return true;
}

function onDragstart(editor, event) {
  event.preventDefault();
}

function onBeforeDelete(editor, event, type) {
  const {
    firstBlock,
    lastBlock,
    firstOffset
  } = orderedSelection(editor.selection);
  const { isCollapsed } = editor.element.getRootNode().getSelection();

  // Selection
  if (!isCollapsed) {
    event.preventDefault();

    replaceSelection(editor);
    return true;
  }

  const text = serializeState(editor.state[firstBlock].content);
  const backwards = event.inputType.endsWith('Backward');

  // Ignore removing past beginning/end
  if (
    backwards && firstOffset === 0 && firstBlock === 0 ||
    !backwards && firstOffset === text.length &&
      lastBlock === editor.state.length -1
  ) return false;

  const changePosition = backwards ? firstOffset - 1 : firstOffset;
  // Let browser handle everything but removing line breaks
  if (text[changePosition]) return false;

  event.preventDefault();

  if (type === 'character') {
    const nextBlock = backwards ?
      firstBlock - 1 :
      firstBlock + 1;
    const newText = serializeState(editor.state[nextBlock].content);

    editor.update(
      getNewState(
        editor,
        backwards ? firstBlock - 1 : firstBlock,
        backwards ? firstBlock : firstBlock + 1,
        backwards ? newText + text : text + newText
      ),
      backwards ? [firstBlock - 1, newText.length] : [firstBlock, text.length]
    );
  }

  return true;
}

function onBeforeInput(editor, event) {
  const types = {
    deleteContentBackward: 'character',
    deleteContentForward: 'character',
    deleteWordBackward: 'word',
    deleteWordForward: 'word',
    deleteSoftLineBackward: 'line',
    deleteSoftLineForward: 'line',
    deleteHardLineBackward: 'line',
    deleteHardLineForward: 'line'
  };

  const type = types[event.inputType];
  if (!type) return;

  return onBeforeDelete(editor, event, type);
}

function onCopy(editor, event) {
  const { isCollapsed } = editor.element.getRootNode().getSelection();
  if (isCollapsed) return;

  const {
    firstBlock,
    lastBlock,
    firstOffset,
    lastOffset
  } = orderedSelection(editor.selection);

  const blocks = editor.state.slice(firstBlock, lastBlock + 1)
    .map(block => serializeState(block.content));
  const lastBlockLength = blocks[blocks.length - 1].length;
  const selection = blocks.join('\n').slice(
    firstOffset,
    lastOffset - lastBlockLength || Infinity
  );

  event.preventDefault();
  event.clipboardData.setData('text/plain', selection);

  return true;
}

function onPaste(editor, event) {
  event.preventDefault();

  replaceSelection(editor, event.clipboardData.getData('text'));

  return true;
}

function onSelectionChange(editor) {
  const sel = editor.element.getRootNode().getSelection();

  // Focus outside editor
  if (!editor.element.contains(sel.anchorNode)) return;

  editor.selection.anchorBlock =
    findBlockIndex(editor.element, sel.anchorNode, sel.anchorOffset);
  editor.selection.focusBlock =
    findBlockIndex(editor.element, sel.focusNode, sel.focusOffset);
}

/**
 * Correct caret position if the line is now in a prior block
 */
function updateCaret(editor, state, [block, offset]) {
  let lineIndex = editor.state.slice(0, block + 1)
    .reduce((acc, val) => acc + val.length, 0);
  const newBlock = state.findIndex(block => {
    if (lineIndex <= block.length) return true;
    lineIndex -= block.length;
    return false;
  });
  if (newBlock === -1) return;
  if (newBlock >= block) return;

  const newOffset = serializeState(state[newBlock].content).split('\n')
    .slice(0, block - newBlock).join('\n').length + 1 + offset;

  return [newBlock, newOffset];
}

function onBeforeUpdate(editor, state, caret) {
  if (!editor.state.length) return;

  const anchor = updateCaret(editor, state, caret.anchor);
  const focus = updateCaret(editor, state, caret.focus);
  if (!anchor && !focus) return;

  return {
    state,
    caret: {
      anchor: anchor || caret.anchor,
      focus: focus || caret.focus
    }
  };
}

export default {
  handlers: {
    input: onInput,
    compositionstart: onCompositionStart,
    compositionend: onCompositionEnd,
    dragstart: onDragstart,
    beforeinput: onBeforeInput,
    copy: onCopy,
    paste: onPaste,
    selectionchange: onSelectionChange
  },
  beforeupdate: onBeforeUpdate
};
