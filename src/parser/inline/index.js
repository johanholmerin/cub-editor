import {
  em,
  strong,
  strikethrough,
  underline,
  mark,
  reference,
  code,
  file,
  image,
  tag
} from './basic.js';

import link from './link.js';
import selfcloseTag from './tag.js';

function text(state) {
  if (typeof state.tokens[state.tokens.length - 1] !== 'string') {
    state.tokens.push('');
  }

  state.tokens[state.tokens.length - 1] += state.string[state.index];
  state.index++;

  return true;
}

const parsers = [
  selfcloseTag,
  strong,
  em,
  strikethrough,
  underline,
  mark,
  reference,
  code,
  file,
  image,
  tag,
  link,

  text
];

export default function parseInline(string) {
  const state = {
    index: 0,
    string,
    tokens: [],
    parse(start, end) {
      return parseInline(string.slice(start, end));
    }
  };

  while (state.index < string.length) {
    for (const parser of parsers) {
      const result = parser(state);
      if (result) break;
    }
  }

  return state.tokens;
}
