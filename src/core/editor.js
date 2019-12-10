import { getOffset, serializeState, setOffset } from './shared.js';
import morphdom from 'morphdom';
import defaultPlugin from './default-plugin.js';
import firefoxPlugin from './firefox.js';
import androidPlugin from './android.js';
import { safari, firefox } from './user-agent.js';

function toDOM(renderer, node) {
  if (typeof node === 'string') return node;

  const content = node.content &&
    node.content.map(child => toDOM(renderer, child));
  return renderer[node.type]({ content });
}

const EVENTS = [
  'beforeinput',
  'compositionstart',
  'compositionend',
  'copy',
  'dragstart',
  'drop',
  'paste',
  'input',
  'keydown',
  'keypress'
];

const DOCUMENT_EVENTS = [
  'selectionchange'
];


/**
 * @typedef {Object} StateNode
 * @property {String} type
 * @property {Array<StateNode|String>} content
 */


function changeHandlers(editor, cmd) {
  for (const name of EVENTS) {
    editor.element[`${cmd}EventListener`](name, editor);
  }
  for (const name of DOCUMENT_EVENTS) {
    document[`${cmd}EventListener`](name, editor);
  }
}

function getPath(obj, path) {
  for (const key of path) {
    obj = obj[key];
    if (!obj) return;
  }
  return obj;
}

/**
 * Call plugins until one returns true
 */
function callPlugins(editor, path, ...args) {
  for (const plugin of editor.plugins) {
    const handler = getPath(plugin, path);
    if (handler && handler(editor, ...args)) break;
  }
}

export default class Editor {
  constructor({
    element,
    value = '',
    renderer = [],
    plugins = [],
    parser
  } = {}) {
    this._elements = [];
    Object.assign(this, { element, renderer, parser });
    this.plugins = [
      firefoxPlugin,
      androidPlugin,
      defaultPlugin,
      ...plugins
    ].filter(Boolean);
    this._state = [];
    this.composing = false;

    const getTypeOffset = type => {
      const sel = this.element.getRootNode().getSelection();
      const block = this.selection[type + 'Block'];
      if (sel[type + 'Node'] === this.element) return 0;
      if (!this.element.contains(sel[type + 'Node'])) return -1;

      return getOffset(
        this.element.children[block],
        sel[type + 'Node'],
        sel[type + 'Offset']
      );
    };
    this.selection = {
      anchorBlock: 0,
      focusBlock: 0,
      get anchorOffset() {
        return getTypeOffset('anchor');
      },
      get focusOffset() {
        return getTypeOffset('focus');
      }
    };

    this.element.contentEditable = true;
    changeHandlers(this, 'add');
    this.value = value;
  }

  /**
   * @private
   */
  handleEvent(event) {
    callPlugins(this, ['handlers', event.type], event);
  }

  /**
   * @param {StateNode[]} state
   * @param {[Number, Number]|{ anchor: [Number, Number], focus: [Number, Number] }} caret
   */
  update(state, caret = [0, 0]) {
    if (!caret.anchor) {
      caret = { focus: caret, anchor: caret.slice() };
    }

    for (const plugin of this.plugins) {
      const handler = plugin.beforeupdate;
      if (!handler) continue;
      const ret = handler(this, state, caret);
      if (!ret) continue;
      state = ret.state;
      caret = ret.caret;
    }

    this.state = state;
    setOffset(this, caret);
  }

  /**
   * @param {StateNode[]} state
   */
  set state(state) {
    if (state === this.state) return;

    const prevState = this.state;
    this._state = state;

    state.forEach((node, index) => {
      const current = this.element.children[index];

      if (prevState.includes(node)) {
        // Avoid having to recreate nodes that haven't changed
        const prevIndex = prevState.indexOf(node);
        const el = this._elements[prevIndex];

        if (el === current) return;
        this.element.insertBefore(el, current);
      } else {
        const el = toDOM(this.renderer, node);

        // Improves caret behavior when contenteditable="false"
        // is the last child or when empty
        if (
          !el.childNodes.length ||
          (safari || firefox) &&
          el.lastChild &&
          el.lastChild.contentEditable === 'false'
        ) {
          el.append(document.createElement('br'));
        }

        const morph = !state.includes(prevState[index]);
        if (morph && this._elements[index]) {
          morphdom(this._elements[index], el);
        } else {
          this.element.insertBefore(el, current);
        }
      }
    });

    // Remove leftover elements
    while (this.element.childElementCount > state.length) {
      this.element.lastElementChild.remove();
    }

    this._elements = Array.from(this.element.children);

    callPlugins(this, ['afterchange']);
  }

  /**
   * @returns {StateNode[]}
   */
  get state() {
    return this._state;
  }

  /**
   * @param {String} value
   */
  set value(value) {
    this.update(Array.from(this.parser(value)));
  }

  /**
   * @returns {String}
   */
  get value() {
    return serializeState(this.state, true);
  }

  destroy() {
    changeHandlers(this, 'remove');
  }

}
