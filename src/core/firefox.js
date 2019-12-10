import shortcut from '../core/shortcut.js';
import { firefox } from './user-agent.js';
import defaultPlugin from './default-plugin.js';

const ACCELERATORS = {
  'Backspace': 'deleteContentBackward',
  'Delete': 'deleteContentForward',
  'Alt+Backspace': 'deleteWordBackward',
  'Alt+Delete': 'deleteWordForward',
  'Mod+Backspace': 'deleteSoftLineBackward',
  'Ctrl+K': 'deleteSoftLineForward'
};

/**
 * Firefox does not support beforeinput
 * https://bugzilla.mozilla.org/show_bug.cgi?id=970802
 */
function onKeydown(editor, event) {
  const match = Object.keys(ACCELERATORS).find(acc => shortcut(acc, event));
  if (!match) return false;

  const inputType = ACCELERATORS[match];
  const beforeEvent = new InputEvent('beforeinput', { inputType });
  beforeEvent.preventDefault = () => event.preventDefault();
  return defaultPlugin.handlers.beforeinput(editor, beforeEvent);
}

export default firefox && {
  handlers: {
    keydown: onKeydown
  }
};
