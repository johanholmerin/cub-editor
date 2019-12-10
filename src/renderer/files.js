/**
 * In-memory map of files
 */

const MAP = {};

export function get(id) {
  return MAP[id];
}

export function set(id, url) {
  MAP[id] = url;
}
