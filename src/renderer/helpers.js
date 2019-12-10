export const Fragment = Symbol('Fragment');

const SVG_ELEMENTS = ['svg', 'path'];

export function h(tag, props, ...children) {
  if (tag === Fragment) {
    return children;
  }

  const isSvg = SVG_ELEMENTS.includes(tag);
  const el = isSvg ?
    document.createElementNS('http://www.w3.org/2000/svg', tag) :
    document.createElement(tag);
  for (const key in props) {
    const type = typeof props[key];
    if (type === 'function') {
      el[key] = props[key];
    } else {
      el.setAttribute(key, props[key]);
    }
  }
  el.append(...children.flat(Infinity));
  return el;
}

export function cls(...str) {
  return str.filter(s => s).join(' ');
}

export function last(list) {
  return list[list.length - 1];
}

/**
 * Make sure URL is absolute
 * @param {String} src
 * @returns {String}
 */
export function formatURL(str) {
  try {
    return new URL(str).href;
  } catch (_) {
    return 'http://' + str.replace(/^\/{0,2}/, '');
  }
}
