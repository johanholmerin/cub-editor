const WHITESPACE = /\s/;

function findCloseIndex(state, match) {
  for (let n = state.index + match.length; n < state.string.length; n++) {
    const char = state.string.substring(n, n + match.length);
    if (char === match && !WHITESPACE.test(state.string[n - 1])) {
      return n;
    }
  }

  return -1;
}

function getChars(chars) {
  if (typeof chars === 'string') {
    return { open: chars, close: chars };
  }
  return chars;
}

function matchChars(CHARS, state, index) {
  for (const chars of CHARS) {
    const chars2 = getChars(chars);
    const slice = state.string.substring(index, index + chars2.open.length);
    if (slice === chars2.open) return chars2;
  }
}

function create(CHARS, type, richContent = true, contentRequired = false) {
  return function (state) {
    const char = matchChars(CHARS, state, state.index);
    if (!char) return false;

    const nextChar = state.string[state.index + char.open.length];
    if (!nextChar || WHITESPACE.test(nextChar)) return false;

    const closeIndex = findCloseIndex(state, char.close);
    if (closeIndex === -1) return false;

    if (contentRequired && closeIndex === state.index + 1) return false;

    const content = richContent ?
      state.parse(state.index + char.open.length, closeIndex) :
      [state.string.slice(state.index + char.open.length, closeIndex)];
    state.tokens.push({
      type,
      content: [
        char.open,
        ...content,
        char.close
      ]
    });
    state.index = closeIndex + char.close.length;

    return true;
  };
}

export const em = create(['*', '_'], 'em');
export const strong = create(['**', '__'], 'strong');
export const underline = create(['~'], 'underline');
export const strikethrough = create(['~~'], 'strikethrough');
export const mark = create(['::'], 'mark');
export const reference = create([{ open: '[[', close: ']]'}], 'reference');
export const code = create(['`'], 'code', false);
export const file = create([{ open: '[file:', close: ']'}], 'file', false);
export const image = create([{ open: '[image:', close: ']'}], 'image', false);
export const tag = create(['#'], 'tag', false, true);
