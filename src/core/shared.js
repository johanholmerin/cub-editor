/**
 * Get the index of the top-level element that contains the node
 */
export function findBlockIndex(container, node, fallback = -1) {
  if (node === container) return fallback;

  while (node.parentNode !== container) {
    node = node.parentNode;
  }
  return Array.from(container.children).indexOf(node);
}

export function getChangeIndexes(editor, event) {
  // Element fired input event
  if (event.target !== editor.element) {
    const blockIndex = findBlockIndex(editor.element, event.target);

    return {
      firstBlockIndex: blockIndex,
      lastBlockIndex: blockIndex
    };
  }

  const { anchorBlock, focusBlock } = editor.selection;
  const firstBlockIndex = Math.min(anchorBlock, focusBlock);
  const lastBlockIndex = Math.max(anchorBlock, focusBlock);

  return { firstBlockIndex, lastBlockIndex };
}

/**
 * Generate a new state array. Replace blocks between `from` and `to`(inclusive)
 * with parsed value of text. Keep unchanged blocks
 */
export function getNewState(editor, from, to, text) {
  const textBefore = editor.state.slice(0, from)
    .map(block => serializeState(block.content).split('\n')).flat();
  const textAfter = editor.state.slice(to + 1)
    .map(block => serializeState(block.content).split('\n')).flat();

  const newState = [];
  const lines = text.split('\n');
  const newLines = [...textBefore, ...lines, ...textAfter];

  let lineIndex = 0;
  let oldLineIndex = 0;
  let preparser = editor.parser(newLines, true);
  let block = preparser.next().value;

  while (block) {
    if (
      lineIndex + block.length - 1 >= textBefore.length &&
      lineIndex < (textBefore.length + lines.length)
    ) {
      // Parse the new text and move `oldLineIndex` to after the change
      let m = 0;
      for (const block of editor.parser(newLines.slice(lineIndex))) {
        m += block.length;
        newState.push(block);
        if (m >= lines.length) break;
      }
      lineIndex += m;
      oldLineIndex += editor.state.slice(from, to + 1)
        .reduce((acc, val) => acc + val.length, m - lines.length);
      preparser = editor.parser(newLines.slice(lineIndex), true);
      block = preparser.next().value;
      continue;
    }

    let n = 0;
    const oldBlock = editor.state.find(block => {
      const match = n === oldLineIndex;
      n += block.length;
      return match;
    });

    if (oldBlock && oldBlock.type === block.type) {
      // Reuse old block
      newState.push(oldBlock);
      lineIndex += block.length;
      oldLineIndex += block.length;
      block = preparser.next().value;
    } else {
      // Type changed
      const newBlock = editor.parser(newLines.slice(lineIndex)).next().value;
      newState.push(newBlock);
      lineIndex += newBlock.length;
      oldLineIndex += newBlock.length;
      preparser = editor.parser(newLines.slice(lineIndex), true);
      block = preparser.next().value;
    }
  }

  return newState;
}


/**
 * Replace non-breaking space with regular
 */
const NON_BREAKING_SPACE = new RegExp(String.fromCharCode(160), 'g');

function normalizeText(text) {
  return text.replace(NON_BREAKING_SPACE, ' ');
}

/**
 * Create an Generator for all text nodes and elements with `data-text` attribute
 */
function* iterateNodes(parent) {
  const treeWalker = document.createTreeWalker(
    parent,
    NodeFilter.SHOW_TEXT + NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        const accept = node.nodeType === Node.TEXT_NODE || node.dataset.text;
        return accept ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    }
  );

  let node = treeWalker.nextNode();
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.dataset.text;
      yield { node, text };
      node = treeWalker.nextSibling();
    } else {
      const text = normalizeText(node.data);
      yield { node, text };
      node = treeWalker.nextNode();
    }
  }
}

/**
 * Get text of a block
 */
export function getText(node) {
  let text = '';

  for (const val of iterateNodes(node)) {
    text += val.text;
  }

  return text;
}

/**
 * Get caret position in a block
 *
 * @param {Element} parent
 * @param {Node} target
 * @param {Number} offset
 * @returns {Number}
 */
export function getOffset(parent, target, offset) {
  // Start of line
  if (target === parent && offset === 0) return 0;

  if (target.nodeType !== Node.TEXT_NODE) {
    if (target === parent) {
      target = parent.childNodes[offset - 1];
      if (target.tagName === 'BR') return 0;

      if (target.nodeType === Node.TEXT_NODE) {
        offset = target.data.length;
      } else if (target.dataset && 'text' in target.dataset) {
        offset = target.dataset.text.length;
      } else {
        const nodes = Array.from(iterateNodes(target));
        target = nodes[nodes.length - 1].node;
        offset = nodes[nodes.length - 1].text.length;
      }
    } else {
      // Find nearest preceding node with text
      let current = parent;
      for (const { node } of iterateNodes(parent)) {
        if (
          node.compareDocumentPosition(target) ===
            Node.DOCUMENT_POSITION_PRECEDING
        ) break;
        current = node;
      }
      target = current;
      if (target === parent && offset === 0) return 0;
      offset = target.dataset ? target.dataset.text.length : target.data.length;
    }
  }

  let pos = 0;

  for (const { node, text } of iterateNodes(parent)) {
    if (target === node) {
      return pos + offset;
    }

    pos += text.length;
  }

  return -1;
}

/**
 * @param {Object} editor
 * @param {[Number, Number]|{ anchor: [Number, Number], focus: [Number, Number] }} caret
 */
export function setOffset(editor, caret) {
  const [anchorBlock, anchorOffset] = caret.anchor || caret;
  const [focusBlock, focusOffset] = caret.focus || caret;

  const startEl = editor.element.children[anchorBlock];
  const endEl = editor.element.children[focusBlock];

  const selection = editor.element.getRootNode().getSelection();
  selection.removeAllRanges();
  const range = document.createRange();

  const anchorPosition = getOffsetPosition(startEl, anchorOffset);
  range.setStart(anchorPosition.node, anchorPosition.offset);
  selection.addRange(range);

  if (anchorBlock !== focusBlock || anchorOffset !== focusOffset) {
    const focusPosition = getOffsetPosition(endEl, focusOffset);
    selection.extend(focusPosition.node, focusPosition.offset);
  }
}

/**
 * Find node and remaining offset for caret position
 */
export function getOffsetPosition(el, offset) {
  if (offset < 0) return { node: el, offset: 0 };

  for (let { node, text } of iterateNodes(el)) {
    if (text.length >= offset) {

      if (node.dataset && 'text' in node.dataset) {
        const prevOffset = offset;
        offset = Array.from(node.parentNode.childNodes).indexOf(node);
        if (prevOffset >= text.length) offset++;
        node = node.parentNode;
      }

      return { node, offset };
    }

    offset -= text.length;
  }

  if (offset > 0) {
    // Continue to next block
    return getOffsetPosition(el.nextSibling, offset - 1);
  }

  return { node: el, offset: 0 };
}

export function serializeState(list, block = false) {
  return list.map(token => {
    if (!token.content) return token;
    return serializeState(token.content);
  }).join(block ? '\n' : '');
}

export function orderedSelection({
  anchorBlock,
  focusBlock,
  anchorOffset,
  focusOffset
}) {
  if (
    anchorBlock > focusBlock ||
    (anchorBlock === focusBlock && anchorOffset > focusOffset)
  ) {
    return {
      firstBlock: focusBlock,
      lastBlock: anchorBlock,
      firstOffset: focusOffset,
      lastOffset: anchorOffset
    };
  }

  return {
    firstBlock: anchorBlock,
    lastBlock: focusBlock,
    firstOffset: anchorOffset,
    lastOffset: focusOffset
  };
}

export function replaceSelection(editor, text = '') {
  const {
    firstBlock,
    lastBlock,
    firstOffset,
    lastOffset
  } = orderedSelection(editor.selection);

  const firstLine = serializeState(editor.state[firstBlock].content);
  const lastLine = firstBlock === lastBlock ?
    firstLine :
    serializeState(editor.state[lastBlock].content);

  const start = firstLine.slice(0, firstOffset) + text;
  const newState = getNewState(
    editor, firstBlock, lastBlock,
    start + lastLine.slice(lastOffset)
  );

  let startLines = start.split('\n').length;
  const addedBlocks = newState.slice(firstBlock).findIndex(block => {
    if (startLines <= block.length) return true;
    startLines -= block.length;
    return false;
  });

  const addedText = firstBlock + addedBlocks < 0 ?
    '' :
    serializeState(newState[firstBlock + addedBlocks].content)
      .split('\n').slice(0, startLines).join('\n').length;

  editor.update(
    newState,
    [
      firstBlock + addedBlocks,
      addedText - lastLine.slice(lastOffset).length
    ]
  );
}
