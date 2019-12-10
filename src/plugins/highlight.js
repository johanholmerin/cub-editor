import styles from './highlight.css';
import { setOffset } from '../core/shared.js';

import Prism from 'prismjs';

// Languages
import 'prismjs/components/prism-apacheconf.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-csharp.js';
import 'prismjs/components/prism-coffeescript.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-lua.js';
import 'prismjs/components/prism-matlab.js';
import 'prismjs/components/prism-objectivec.js';
import 'prismjs/components/prism-perl.js';
import 'prismjs/components/prism-php.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-r.js';
import 'prismjs/components/prism-ruby.js';
import 'prismjs/components/prism-scala.js';
import 'prismjs/components/prism-scss.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-swift.js';
import 'prismjs/components/prism-latex.js';

// Language aliases
Object.assign(Prism.languages, {
  apache: Prism.languages.apacheconf,
  'c++': Prism.languages.cpp,
  'c#': Prism.languages.csharp,
  golang: Prism.languages.go,
  mat: Prism.languages.matlab,
  objc: Prism.languages.objectivec,
  py: Prism.languages.python,
  sc: Prism.languages.scala,
  sh: Prism.languages.bash,
  shell: Prism.languages.bash,
  tex: Prism.languages.latex
});

/**
 * @typedef Token
 * @property {String} type
 * @property {String|Token|Array<Token|String>} content
 */

/**
 * @param {Token} token
 * @returns {Node}
 */
function tokenToNode(token) {
  if (typeof token === 'string') return token;

  const content = Array.isArray(token.content) ?
    token.content.map(tokenToNode) :
    [tokenToNode(token.content)];

  const node = document.createElement('span');
  const className = styles[token.type.trim()];
  if (className) node.className = className;
  node.append(...content);

  return node;
}

const TIMEOUT = 500;

export default function highlightPlugin() {
  let cb;

  return {
    afterchange(editor) {
      if (cb) clearTimeout(cb);

      // Wait until typing has stopped
      cb = setTimeout(() => {
        cb = undefined;

        for (const block of editor.state) {
          if (block.type !== 'code_block') continue;

          const index = editor.state.indexOf(block);
          const { content: [, language, , code] } = block;

          const blockNode = editor.element.children[index];
          // Already highlighted
          if (blockNode.childNodes.length !== 6) continue;

          const grammar = Prism.languages[language.trim()];
          if (!grammar) continue;

          const {
            anchorBlock,
            anchorOffset,
            focusBlock,
            focusOffset
          } = editor.selection;

          const tokens = Prism.tokenize(code, grammar);
          const frag = document.createDocumentFragment();
          frag.append(...tokens.map(tokenToNode));

          blockNode.childNodes[3].replaceWith(frag);

          if (anchorOffset !== -1) {
            setOffset(editor, {
              anchor: [anchorBlock, anchorOffset],
              focus: [focusBlock, focusOffset]
            });
          }
        }
      }, TIMEOUT);

    }
  };
}
