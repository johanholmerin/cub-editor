import {
  getOffset,
  findBlockIndex,
  serializeState,
  getNewState
} from '../core/shared.js';
import { set as setFileURL } from '../renderer/files.js';

/**
 * Document.caretPositionFromPoint() is only supported by Firefox.
 * Other browsers support non-standard Document.caretRangeFromPoint()
 * Chrome: http://crbug.com/388976
 * Safari: https://bugs.webkit.org/show_bug.cgi?id=172137
 * Edge: https://connect.microsoft.com/IE/feedback/details/693228/implement-document-caretpositionfrompoint
 */
function caretPositionFromPoint(node, x, y) {
  const root = node.getRootNode();
  if (root.caretPositionFromPoint) {
    return root.caretPositionFromPoint(x, y);
  }

  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;

  return {
    offset: range.startOffset,
    offsetNode: range.startContainer
  };
}

function getPositionFromPoint(editor, { clientX, clientY }) {
  const pos = caretPositionFromPoint(editor.element, clientX, clientY);
  const block = findBlockIndex(editor.element, pos.offsetNode);
  const offset = getOffset(
    editor.element.children[block],
    pos.offsetNode,
    pos.offset
  );

  return { block, offset };
}

function generateId() {
  return (Math.random()).toString(36).slice(2, 7);
}

function getDropValue(dataTransfer) {
  if (dataTransfer.files.length) {
    return Array.from(dataTransfer.files).map(file => {
      const type = file.type.startsWith('image/') ? 'image': 'file';
      const id = generateId();
      const url = URL.createObjectURL(file);

      setFileURL(id, url);

      return `[${type}:${id}/${file.name}]`;
    }).join('');
  }

  return dataTransfer.getData('text/plain');
}

export default function dropPlugin() {
  return {
    handlers: {
      drop(editor, event) {
        if (!event.dataTransfer) return;

        event.preventDefault();

        const { block, offset } = getPositionFromPoint(editor, event);
        const text = getDropValue(event.dataTransfer);

        const line = serializeState(editor.state[block].content);
        editor.update(
          getNewState(
            editor, block, block,
            line.slice(0, offset) + text + line.slice(offset)
          ),
          [block, offset + text.length]
        );
      }
    }
  };
}
