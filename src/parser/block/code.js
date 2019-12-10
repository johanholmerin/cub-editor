const OPEN = /^(`{3})(.*)$/;
const CLOSE = /^`{3,}.*$/;

function findClosingLine({ lines, index }) {
  for (let n = index + 1; n < lines.length; n++) {
    if (CLOSE.test(lines[n])) return n;
  }

  return -1;
}

export default function code({ lines, index }) {
  const line = lines[index];
  let match;
  if (!(match = OPEN.exec(line))) return;

  const closingLineIndex = findClosingLine({ lines, index });
  if (closingLineIndex === -1) return;

  const content = index + 1 === closingLineIndex ?
    [''] :
    [lines.slice(index + 1, closingLineIndex).join('\n'), '\n'];

  return {
    type: 'code_block',
    content: [
      match[1],
      match[2],
      '\n',
      ...content,
      lines[closingLineIndex]
    ],
    length: closingLineIndex - index + 1
  };
}
