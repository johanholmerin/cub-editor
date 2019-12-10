import Editor from './core/editor.js';
import renderer from './renderer/index.js';
import styles from './renderer/styles.css';
import parser from './parser/block/index.js';
import enterPlugin from './plugins/enter.js';
import tabPlugin from './plugins/tab.js';
import historyPlugin from './plugins/history.js';
import highlightPlugin from './plugins/highlight.js';
import formatPlugin from './plugins/format.js';
import orderedListPlugin from './plugins/ordered-list.js';
import dropPlugin from './plugins/drop.js';

export default class DefaultEditor extends Editor {
  constructor({ element, value } = {}) {
    element.classList.add(styles.editor);

    const plugins = [
      enterPlugin(),
      tabPlugin(),
      historyPlugin(),
      highlightPlugin(),
      formatPlugin(),
      orderedListPlugin(),
      dropPlugin()
    ];

    super({ element, value, plugins, renderer, parser });
  }
}
