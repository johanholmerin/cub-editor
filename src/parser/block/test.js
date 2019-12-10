import assert from 'assert';
import parseBlock from './index.js';

const cases = [
  // paragraph
  {
    input: '*foo*',
    expected: [
      {
        type: 'paragraph',
        length: 1,
        content: [
          {
            type: 'em',
            content: ['*', 'foo', '*']
          }
        ]
      }
    ]
  },
  // heading
  {
    input: '## foo',
    expected: [
      {
        type: 'heading',
        length: 1,
        content: [
          '##',
          ' foo'
        ]
      }
    ]
  },
  // horizontal_rule
  {
    input: '***',
    expected: [
      {
        type: 'horizontal_rule',
        length: 1,
        content: ['***']
      }
    ]
  },
  {
    input: '________',
    expected: [
      {
        type: 'horizontal_rule',
        length: 1,
        content: ['________']
      }
    ]
  },
  // code
  {
    input: `\`\`\`javascript
console.log(1);
console.log(2);
\`\`\``,
    expected: [
      {
        type: 'code_block',
        length: 4,
        content: [
          '```',
          'javascript',
          '\n',
          'console.log(1);\nconsole.log(2);',
          '\n',
          '```'
        ]
      }
    ]
  },
  {
    input: `\`\`\`javascript
\`\`\``,
    expected: [
      {
        type: 'code_block',
        length: 2,
        content: [
          '```',
          'javascript',
          '\n',
          '',
          '```'
        ]
      }
    ]
  },
  // todo_item
  {
    input: '- [x] foo',
    expected: [
      {
        type: 'todo_item',
        length: 1,
        content: [
          '',
          '- [x]',
          ' ',
          'foo'
        ]
      }
    ]
  },
  // blockquote
  {
    input: `> foo bar
> lorem ipsum`,
    expected: [
      {
        type: 'blockquote',
        length: 1,
        content: [
          '>',
          ' foo bar'
        ]
      },
      {
        type: 'blockquote',
        length: 1,
        content: [
          '>',
          ' lorem ipsum'
        ]
      }
    ]
  },
  // unordered_list_item
  {
    input: `* foo
- bar`,
    expected: [
      {
        type: 'unordered_list_item',
        length: 1,
        content: [
          '',
          '*',
          ' foo'
        ]
      },
      {
        type: 'unordered_list_item',
        length: 1,
        content: [
          '',
          '-',
          ' bar'
        ]
      }
    ]
  },
  // unordered_list_item
  {
    input: `1. foo
2. bar`,
    expected: [
      {
        type: 'ordered_list_item',
        length: 1,
        content: [
          '',
          '1',
          '.',
          ' foo'
        ]
      },
      {
        type: 'ordered_list_item',
        length: 1,
        content: [
          '',
          '2',
          '.',
          ' bar'
        ]
      }
    ]
  }
];

function flatten(list, block) {
  return list.map(token => {
    if (!token.content) return token;
    return flatten(token.content, false);
  }).join(block ? '\n' : '');
}

for (const { input, expected } of cases) {
  const result = Array.from(parseBlock(input));
  assert.deepEqual(result, expected);
  // 1-to-1 mapping of text
  assert.equal(flatten(result, true), input);
}

console.log('OK');
