import { serializeState, setOffset } from '../core/shared.js';
import shortcut from '../core/shortcut.js';

function diff(str1, str2) {
  if (str1 === str2) {
    return { added: '', removed: '', position: -1 };
  }

  // Iterate over the strings to find differences.
  let position = 0;
  while (str1[position] === str2[position]) {
    position++;
  }

  let m = 0;
  while (
    str1[str1.length - m] === str2[str2.length - m] &&
    m <= str1.length - position
  ) m++;
  m--;

  const added = str2.slice(position, str2.length - m);
  const removed = str1.substr(
    position,
    str1.length - str2.length + added.length
  );

  return { added, removed, position };
}

export default function historyPlugin() {
  const hist = [];
  let historyPosition = 0;

  function addToHistory(state) {
    hist.splice(historyPosition);
    hist.push(state);
    historyPosition = hist.length;
  }

  function undo(editor) {
    if (historyPosition <= 1) return;

    historyPosition--;
    const prevState = editor.state;
    supress = true;
    editor.state = hist[historyPosition - 1];
    supress = false;

    const blocks = editor.state.map(block => serializeState(block.content));
    let {
      added,
      position
    } = diff(serializeState(prevState, true), blocks.join('\n'));
    if (position === -1) return;

    const firstBlock = blocks.findIndex(block => {
      if (block.length >= position) return true;
      position -= block.length + 1;
      return false;
    });
    let n = position + added.length;
    const lastBlock = blocks.slice(firstBlock).findIndex(block => {
      if (block.length >= n) return true;
      n -= block.length + 1;
      return false;
    }) + firstBlock;

    setOffset(editor, {
      anchor: [firstBlock, position],
      focus: [lastBlock, n]
    });
  }

  function redo(editor) {
    if (hist.length === historyPosition) return;

    const prevState = editor.state;
    supress = true;
    editor.state = hist[historyPosition];
    supress = false;
    historyPosition++;

    const blocks = editor.state.map(block => serializeState(block.content));
    let {
      added,
      position
    } = diff(serializeState(prevState, true), blocks.join('\n'));
    if (position === -1) return;

    const firstBlock = blocks.findIndex(block => {
      if (block.length >= position) return true;
      position -= block.length + 1;
      return false;
    });

    setOffset(editor, [firstBlock, position + added.length]);
  }

  let supress = false;
  let cb;
  return {
    afterchange(editor) {
      clearTimeout(cb);
      if (!supress) {
        cb = setTimeout(() => {
          addToHistory(editor.state);
        }, 150);
      }
    },
    handlers: {
      beforeinput(editor, event) {
        if (event.inputType === 'historyUndo') undo(editor);
        else if (event.inputType === 'historyRedo') redo(editor);
        else return false;

        event.preventDefault();
        return true;
      },
      keydown(editor, event) {
        if (shortcut('Mod+Z', event)) {
          undo(editor);
        } else if (shortcut('Mod+Y', event) || shortcut('Mod+Shift+Z', event)) {
          redo(editor);
        } else {
          return false;
        }

        event.preventDefault();
        return true;
      }
    }
  };
}
