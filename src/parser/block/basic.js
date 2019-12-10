const HEADING = /^(#{1,6}) /;
const HR = /^(-{3,}|\*{3,}|_{3,})$/;
const TODO_ITEM = /^(\s*)(- \[(?: |x)\])( )/;
const ORDERED_ITEM = /^(\s*)(\d+)(\.) /;
const UNORDERED_ITEM = /^(\s*)([*-]) /;
const BLOCKQUOTE = /^(>) /;

function matchLine(regex, type) {
  return ({ lines, index, parseInline }) => {
    const line = lines[index];
    const match = regex.exec(line);
    if (!match) return;

    const matches = match.slice(1);
    return {
      type,
      content: [
        ...matches,
        ...parseInline(line.slice(matches.join('').length))
      ],
      length: 1
    };
  };
}

export const heading = matchLine(HEADING, 'heading');
export const horizontal_rule = matchLine(HR, 'horizontal_rule');
export const todo_item = matchLine(TODO_ITEM, 'todo_item');
export const ordered_list = matchLine(ORDERED_ITEM, 'ordered_list_item');
export const unordered_list = matchLine(UNORDERED_ITEM, 'unordered_list_item');
export const blockquote = matchLine(BLOCKQUOTE, 'blockquote');

export function paragraph({ lines, index, parseInline }) {
  return {
    type: 'paragraph',
    content: parseInline(lines[index]),
    length: 1
  };
}
