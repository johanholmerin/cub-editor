const OPEN_BRACKET = '[';
const CLOSE_BRACKET = ']';
const OPEN_PAR = '(';
const CLOSE_PAR = ')';

function findCloseIndex(state, start, match) {
  for (let n = start; n < state.string.length; n++) {
    if (state.string[n] === match) return n;
  }

  return -1;
}

export default function link(state) {
  if (state.string[state.index] !== OPEN_BRACKET) return false;

  const closeBracketIndex = findCloseIndex(state, state.index, CLOSE_BRACKET);
  if (closeBracketIndex === -1) return false;
  if (state.index === closeBracketIndex - 1) return false;

  const text = state.string.slice(state.index + 1, closeBracketIndex);
  if (text.includes(OPEN_BRACKET)) return false;

  if (state.string[closeBracketIndex + 1] !== OPEN_PAR) return false;

  const closeParIndex = findCloseIndex(state, state.index, CLOSE_PAR);
  if (closeParIndex === -1) return false;

  const url = state.string.slice(closeBracketIndex + 2, closeParIndex);
  if (url.includes(OPEN_PAR)) return false;

  // No url
  if (closeBracketIndex === closeParIndex - 2) return false;

  state.tokens.push({
    type: 'link',
    content: [
      OPEN_BRACKET,
      text,
      CLOSE_BRACKET,
      OPEN_PAR,
      url,
      CLOSE_PAR
    ]
  });
  state.index = closeParIndex + 1;

  return true;
}
