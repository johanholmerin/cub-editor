import assert from 'assert';
import parseInline from './index.js';

const cases = [
  // em
  {
    input: '*asd asd*',
    expected: [
      {
        type: 'em',
        content: [
          '*',
          'asd asd',
          '*'
        ]
      }
    ]
  },
  {
    input: 'asd ***',
    expected: [
      'asd ',
      {
        type: 'em',
        content: [
          '*',
          '*'
        ]
      },
      '*'
    ]
  },
  // {
  //   input: '*lorem **dolor**',
  //   expected: [
  //     '*lorem ',
  //     {
  //       type: 'strong',
  //       content: [
  //         '**',
  //         'dolor',
  //         '**'
  //       ]
  //     }
  //   ]
  // },
  // strong
  {
    input: '**asd asd**',
    expected: [
      {
        type: 'strong',
        content: [
          '**',
          'asd asd',
          '**'
        ]
      }
    ]
  },
  // em and strong
  {
    input: '*asd __asd__ asd*',
    expected: [
      {
        type: 'em',
        content: [
          '*',
          'asd ',
          {
            type: 'strong',
            content: ['__', 'asd', '__']
          },
          ' asd',
          '*'
        ]
      }
    ]
  },
  {
    input: '**asd **asd** asd**',
    expected: [
      {
        type: 'strong',
        content: [
          '**',
          'asd ',
          {
            type: 'em',
            content: ['*', '*']
          },
          'asd',
          '**'
        ]
      },
      ' asd',
      {
        type: 'em',
        content: ['*', '*']
      }
    ]
  },
  // nothing
  {
    input: '* asd asd*',
    expected: ['* asd asd*']
  },
  // mark
  {
    input: '::foo::',
    expected: [
      {
        type: 'mark',
        content: [
          '::',
          'foo',
          '::'
        ]
      }
    ]
  },
  // reference
  {
    input: '[[foo *bar* baz]]',
    expected: [
      {
        type: 'reference',
        content: [
          '[[',
          'foo ',
          {
            type: 'em',
            content: [
              '*',
              'bar',
              '*'
            ]
          },
          ' baz',
          ']]'
        ]
      }
    ]
  },
  // code
  {
    input: '`foo *bar* baz`',
    expected: [
      {
        type: 'code',
        content: [
          '`',
          'foo *bar* baz',
          '`'
        ]
      }
    ]
  },
  // self-closing tag
  {
    input: '#foo/asd bar',
    expected: [
      {
        type: 'tag',
        content: [
          '#',
          'foo/asd',
          ''
        ]
      },
      ' bar'
    ]
  },
  {
    input: 'asd #foo',
    expected: [
      'asd ',
      {
        type: 'tag',
        content: [
          '#',
          'foo',
          ''
        ]
      }
    ]
  },
  {
    input: '#foo#bar',
    expected: [
      {
        type: 'tag',
        content: [
          '#',
          'foo',
          '#'
        ]
      },
      'bar'
    ]
  },
  {
    input: '#tag #another tag# #nest/tag#',
    expected: [
      {
        type: 'tag',
        content: ['#', 'tag', '']
      },
      ' ',
      {
        type: 'tag',
        content: ['#', 'another tag', '#']
      },
      ' ',
      {
        type: 'tag',
        content: ['#', 'nest/tag', '#']
      }
    ]
  },
  {
    input: '##',
    expected: ['##']
  },
  {
    input: '###asd',
    expected: ['###asd']
  },
  {
    input: 'foo#asd',
    expected: ['foo#asd']
  },
  // link
  {
    input: '[Foo *bar* baz](https://example.com)',
    expected: [
      {
        type: 'link',
        content: [
          '[',
          'Foo *bar* baz',
          ']',
          '(',
          'https://example.com',
          ')'
        ]
      }
    ]
  },
  {
    input: '[ads[Link](https://example.com)',
    expected: [
      '[ads',
      {
        type: 'link',
        content: [
          '[',
          'Link',
          ']',
          '(',
          'https://example.com',
          ')'
        ]
      }
    ]
  },
  {
    input: '[Link](https(://example.com)',
    expected: ['[Link](https(://example.com)']
  },
  {
    input: '[](foo)',
    expected: ['[](foo)']
  },
  {
    input: '[foo]()',
    expected: ['[foo]()']
  }
];

function flatten(list) {
  return list.map(token => {
    return token.content ? flatten(token.content) : token;
  }).join('');
}

for (const { input, expected } of cases) {
  const result = parseInline(input);
  assert.deepEqual(result, expected);
  // 1-to-1 mapping of text
  assert.equal(flatten(result), input);
}

console.log('OK');
