import {
  heading,
  horizontal_rule,
  todo_item,
  ordered_list,
  unordered_list,
  blockquote,
  paragraph
} from './basic.js';
import parseInline from '../inline/index.js';
import code from './code.js';

const parsers = [
  heading,
  horizontal_rule,
  todo_item,
  ordered_list,
  unordered_list,
  blockquote,
  code,
  paragraph
];

export default function* parseBlock(value, typeOnly = false) {
  let index = 0;
  const lines = Array.isArray(value) ? value : value.split('\n');

  while (index < lines.length) {
    for (const parser of parsers) {
      const result = parser({
        parseInline: typeOnly ? string => [string] : parseInline,
        lines, index
      });
      if (result) {
        index += result.length;

        yield result;
        break;
      }
    }
  }
}
