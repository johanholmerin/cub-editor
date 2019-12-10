import { mac } from './user-agent.js';

/**
 * @param {String[]} acc
 * @returns {String}
 */
function normalizeKeys(acc) {
  return acc
    .filter((e, i, a) => a.indexOf(e) === i)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .join('+')
    .toLowerCase();
}

/**
 * @param {String} acc
 * @returns {String}
 */
function normalizeAcc(acc) {
  return normalizeKeys(acc.replace('Mod', mac ? 'Meta' : 'Ctrl').split('+'));
}

/**
 * @param {Event} event
 * @returns {String}
 */
function parseEventKeys(event) {
  const { key } = event;
  const keys = [key];
  if (event.altKey) keys.push('Alt');
  if (event.ctrlKey) keys.push('Ctrl');
  if (event.metaKey) keys.push('Meta');
  if (event.shiftKey) keys.push('Shift');
  return normalizeKeys(keys);
}

/**
 * Check if key event matches an accelerator, e.g. `Ctrl+B`
 * `Mod` can be used as `Meta` on Mac and `Ctrl` otherwise
 * @param {String} acc
 * @param {Event} event
 * @returns {Boolean}
 */
export default function(acc, event) {
  const shortcut = normalizeAcc(acc);
  const eventKeys = parseEventKeys(event);
  return shortcut === eventKeys;
}
