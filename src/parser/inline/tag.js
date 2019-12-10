const WHITESPACE = /\s/;
const CHAR = '#';

function findEnd(state) {
  for (let n = state.index + 1; n < state.string.length; n++) {
    const char = state.string[n];
    if (char === CHAR || WHITESPACE.test(char)) return n;
  }

  return state.string.length;
}

function isSelfClosing(state, start) {
  for (let n = start; n < state.string.length; n++) {
    const char = state.string[n];
    if (char === CHAR) {
      if (!WHITESPACE.test(state.string[n - 1])) {
        return false;
      } else if (!WHITESPACE.test(state.string[n + 1])) {
        return true;
      }
    }
  }

  return true;
}

/**
 * Self-closing tag matcher
 */
export default function tag(state) {
  if (state.string[state.index] !== CHAR) return false;

  const prevChar = state.string[state.index - 1];
  if (prevChar && !WHITESPACE.test(prevChar)) return false;

  const nextChar = state.string[state.index + 1];
  if (!nextChar || WHITESPACE.test(nextChar) || nextChar === CHAR) return false;

  const endIndex = findEnd(state);
  const selfClosing = isSelfClosing(state, endIndex);
  if (!selfClosing) return false;

  // Closing tag without whitespace found
  const closing = state.string[endIndex - 1] === CHAR;
  const content = state.string.slice(
    state.index + 1,
    closing ? endIndex - 1 : endIndex
  );

  state.tokens.push({
    type: 'tag',
    content: [
      CHAR,
      content,
      closing ? '#' : ''
    ]
  });
  state.index = endIndex;

  return true;
}
