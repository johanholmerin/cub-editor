const TYPE = 'ordered_list_item';

function changeCaret(caret, blockIndex, offset, diff) {
  if (caret[0] >= blockIndex && caret[1] >= offset) {
    caret[1] -= diff;
  }
}

/**
 * Ensure numbering of ordered list is correct
 */
export default function orderedList() {
  return {
    beforeupdate(editor, state, caret) {
      const newState = state.slice();
      const newCaret = {
        anchor: caret.anchor.slice(),
        focus: caret.focus.slice()
      };

      let changed = false;
      for (const block of state) {
        if (block.type !== TYPE) continue;
        const index = state.indexOf(block);
        const indentation = block.content[0];

        let n = index - 1;
        while (state[n] && newState[n].type === TYPE) {
          if (newState[n].content[0]=== indentation) {
            const number = parseInt(newState[n].content[1]) + 1;
            // Avoid exponential notation
            const numberString = number.toLocaleString(undefined, {
              useGrouping: false
            });
            if (numberString === newState[index].content[1]) break;
            changed = true;
            const posDiff = block.content[1].length - numberString.length;
            const offset = indentation.length;
            newState[index] = {
              ...block,
              content: [indentation, numberString, ...block.content.slice(2)]
            };
            changeCaret(newCaret.anchor, index, offset, posDiff);
            changeCaret(newCaret.focus, index, offset, posDiff);
            break;
          }
          n--;
        }
      }

      if (!changed) return;
      return { state: newState, caret: newCaret };
    }
  };
}
