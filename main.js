/**
 * Get the index of the top-level element that contains the node
 */
function findBlockIndex(container, node, fallback = -1) {
  if (node === container) return fallback;

  while (node.parentNode !== container) {
    node = node.parentNode;
  }

  return Array.from(container.children).indexOf(node);
}
function getChangeIndexes(editor, event) {
  // Element fired input event
  if (event.target !== editor.element) {
    const blockIndex = findBlockIndex(editor.element, event.target);
    return {
      firstBlockIndex: blockIndex,
      lastBlockIndex: blockIndex
    };
  }

  const {
    anchorBlock,
    focusBlock
  } = editor.selection;
  const firstBlockIndex = Math.min(anchorBlock, focusBlock);
  const lastBlockIndex = Math.max(anchorBlock, focusBlock);
  return {
    firstBlockIndex,
    lastBlockIndex
  };
}
/**
 * Generate a new state array. Replace blocks between `from` and `to`(inclusive)
 * with parsed value of text. Keep unchanged blocks
 */

function getNewState(editor, from, to, text) {
  const textBefore = editor.state.slice(0, from).map(block => serializeState(block.content).split('\n')).flat();
  const textAfter = editor.state.slice(to + 1).map(block => serializeState(block.content).split('\n')).flat();
  const newState = [];
  const lines = text.split('\n');
  const newLines = [...textBefore, ...lines, ...textAfter];
  let lineIndex = 0;
  let oldLineIndex = 0;
  let preparser = editor.parser(newLines, true);
  let block = preparser.next().value;

  while (block) {
    if (lineIndex + block.length - 1 >= textBefore.length && lineIndex < textBefore.length + lines.length) {
      // Parse the new text and move `oldLineIndex` to after the change
      let m = 0;

      for (const block of editor.parser(newLines.slice(lineIndex))) {
        m += block.length;
        newState.push(block);
        if (m >= lines.length) break;
      }

      lineIndex += m;
      oldLineIndex += editor.state.slice(from, to + 1).reduce((acc, val) => acc + val.length, m - lines.length);
      preparser = editor.parser(newLines.slice(lineIndex), true);
      block = preparser.next().value;
      continue;
    }

    let n = 0;
    const oldBlock = editor.state.find(block => {
      const match = n === oldLineIndex;
      n += block.length;
      return match;
    });

    if (oldBlock && oldBlock.type === block.type) {
      // Reuse old block
      newState.push(oldBlock);
      lineIndex += block.length;
      oldLineIndex += block.length;
      block = preparser.next().value;
    } else {
      // Type changed
      const newBlock = editor.parser(newLines.slice(lineIndex)).next().value;
      newState.push(newBlock);
      lineIndex += newBlock.length;
      oldLineIndex += newBlock.length;
      preparser = editor.parser(newLines.slice(lineIndex), true);
      block = preparser.next().value;
    }
  }

  return newState;
}
/**
 * Replace non-breaking space with regular
 */

const NON_BREAKING_SPACE = new RegExp(String.fromCharCode(160), 'g');

function normalizeText(text) {
  return text.replace(NON_BREAKING_SPACE, ' ');
}
/**
 * Create an Generator for all text nodes and elements with `data-text` attribute
 */


function* iterateNodes(parent) {
  const treeWalker = document.createTreeWalker(parent, NodeFilter.SHOW_TEXT + NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      const accept = node.nodeType === Node.TEXT_NODE || node.dataset.text;
      return accept ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }

  });
  let node = treeWalker.nextNode();

  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.dataset.text;
      yield {
        node,
        text
      };
      node = treeWalker.nextSibling();
    } else {
      const text = normalizeText(node.data);
      yield {
        node,
        text
      };
      node = treeWalker.nextNode();
    }
  }
}
/**
 * Get text of a block
 */


function getText(node) {
  let text = '';

  for (const val of iterateNodes(node)) {
    text += val.text;
  }

  return text;
}
/**
 * Get caret position in a block
 *
 * @param {Element} parent
 * @param {Node} target
 * @param {Number} offset
 * @returns {Number}
 */

function getOffset(parent, target, offset) {
  // Start of line
  if (target === parent && offset === 0) return 0;

  if (target.nodeType !== Node.TEXT_NODE) {
    if (target === parent) {
      target = parent.childNodes[offset - 1];
      if (target.tagName === 'BR') return 0;

      if (target.nodeType === Node.TEXT_NODE) {
        offset = target.data.length;
      } else if (target.dataset && 'text' in target.dataset) {
        offset = target.dataset.text.length;
      } else {
        const nodes = Array.from(iterateNodes(target));
        target = nodes[nodes.length - 1].node;
        offset = nodes[nodes.length - 1].text.length;
      }
    } else {
      // Find nearest preceding node with text
      let current = parent;

      for (const {
        node
      } of iterateNodes(parent)) {
        if (node.compareDocumentPosition(target) === Node.DOCUMENT_POSITION_PRECEDING) break;
        current = node;
      }

      target = current;
      if (target === parent && offset === 0) return 0;
      offset = target.dataset ? target.dataset.text.length : target.data.length;
    }
  }

  let pos = 0;

  for (const {
    node,
    text
  } of iterateNodes(parent)) {
    if (target === node) {
      return pos + offset;
    }

    pos += text.length;
  }

  return -1;
}
/**
 * @param {Object} editor
 * @param {[Number, Number]|{ anchor: [Number, Number], focus: [Number, Number] }} caret
 */

function setOffset(editor, caret) {
  const [anchorBlock, anchorOffset] = caret.anchor || caret;
  const [focusBlock, focusOffset] = caret.focus || caret;
  const startEl = editor.element.children[anchorBlock];
  const endEl = editor.element.children[focusBlock];
  const selection = editor.element.getRootNode().getSelection();
  selection.removeAllRanges();
  const range = document.createRange();
  const anchorPosition = getOffsetPosition(startEl, anchorOffset);
  range.setStart(anchorPosition.node, anchorPosition.offset);
  selection.addRange(range);

  if (anchorBlock !== focusBlock || anchorOffset !== focusOffset) {
    const focusPosition = getOffsetPosition(endEl, focusOffset);
    selection.extend(focusPosition.node, focusPosition.offset);
  }
}
/**
 * Find node and remaining offset for caret position
 */

function getOffsetPosition(el, offset) {
  if (offset < 0) return {
    node: el,
    offset: 0
  };

  for (let {
    node,
    text
  } of iterateNodes(el)) {
    if (text.length >= offset) {
      if (node.dataset && 'text' in node.dataset) {
        const prevOffset = offset;
        offset = Array.from(node.parentNode.childNodes).indexOf(node);
        if (prevOffset >= text.length) offset++;
        node = node.parentNode;
      }

      return {
        node,
        offset
      };
    }

    offset -= text.length;
  }

  if (offset > 0) {
    // Continue to next block
    return getOffsetPosition(el.nextSibling, offset - 1);
  }

  return {
    node: el,
    offset: 0
  };
}
function serializeState(list, block = false) {
  return list.map(token => {
    if (!token.content) return token;
    return serializeState(token.content);
  }).join(block ? '\n' : '');
}
function orderedSelection({
  anchorBlock,
  focusBlock,
  anchorOffset,
  focusOffset
}) {
  if (anchorBlock > focusBlock || anchorBlock === focusBlock && anchorOffset > focusOffset) {
    return {
      firstBlock: focusBlock,
      lastBlock: anchorBlock,
      firstOffset: focusOffset,
      lastOffset: anchorOffset
    };
  }

  return {
    firstBlock: anchorBlock,
    lastBlock: focusBlock,
    firstOffset: anchorOffset,
    lastOffset: focusOffset
  };
}
function replaceSelection(editor, text = '') {
  const {
    firstBlock,
    lastBlock,
    firstOffset,
    lastOffset
  } = orderedSelection(editor.selection);
  const firstLine = serializeState(editor.state[firstBlock].content);
  const lastLine = firstBlock === lastBlock ? firstLine : serializeState(editor.state[lastBlock].content);
  const start = firstLine.slice(0, firstOffset) + text;
  const newState = getNewState(editor, firstBlock, lastBlock, start + lastLine.slice(lastOffset));
  let startLines = start.split('\n').length;
  const addedBlocks = newState.slice(firstBlock).findIndex(block => {
    if (startLines <= block.length) return true;
    startLines -= block.length;
    return false;
  });
  const addedText = firstBlock + addedBlocks < 0 ? '' : serializeState(newState[firstBlock + addedBlocks].content).split('\n').slice(0, startLines).join('\n').length;
  editor.update(newState, [firstBlock + addedBlocks, addedText - lastLine.slice(lastOffset).length]);
}

var DOCUMENT_FRAGMENT_NODE = 11;

function morphAttrs(fromNode, toNode) {
  var toNodeAttrs = toNode.attributes;
  var attr;
  var attrName;
  var attrNamespaceURI;
  var attrValue;
  var fromValue; // document-fragments dont have attributes so lets not do anything

  if (toNode.nodeType === DOCUMENT_FRAGMENT_NODE || fromNode.nodeType === DOCUMENT_FRAGMENT_NODE) {
    return;
  } // update attributes on original DOM element


  for (var i = 0; i < toNodeAttrs.length; i++) {
    attr = toNodeAttrs[i];
    attrName = attr.name;
    attrNamespaceURI = attr.namespaceURI;
    attrValue = attr.value;

    if (attrNamespaceURI) {
      attrName = attr.localName || attrName;
      fromValue = fromNode.getAttributeNS(attrNamespaceURI, attrName);

      if (fromValue !== attrValue) {
        if (attr.prefix === 'xmlns') {
          attrName = attr.name; // It's not allowed to set an attribute with the XMLNS namespace without specifying the `xmlns` prefix
        }

        fromNode.setAttributeNS(attrNamespaceURI, attrName, attrValue);
      }
    } else {
      fromValue = fromNode.getAttribute(attrName);

      if (fromValue !== attrValue) {
        fromNode.setAttribute(attrName, attrValue);
      }
    }
  } // Remove any extra attributes found on the original DOM element that
  // weren't found on the target element.


  var fromNodeAttrs = fromNode.attributes;

  for (var d = 0; d < fromNodeAttrs.length; d++) {
    attr = fromNodeAttrs[d];
    attrName = attr.name;
    attrNamespaceURI = attr.namespaceURI;

    if (attrNamespaceURI) {
      attrName = attr.localName || attrName;

      if (!toNode.hasAttributeNS(attrNamespaceURI, attrName)) {
        fromNode.removeAttributeNS(attrNamespaceURI, attrName);
      }
    } else {
      if (!toNode.hasAttribute(attrName)) {
        fromNode.removeAttribute(attrName);
      }
    }
  }
}

var range; // Create a range object for efficently rendering strings to elements.

var NS_XHTML = 'http://www.w3.org/1999/xhtml';
var doc = typeof document === 'undefined' ? undefined : document;
var HAS_TEMPLATE_SUPPORT = !!doc && 'content' in doc.createElement('template');
var HAS_RANGE_SUPPORT = !!doc && doc.createRange && 'createContextualFragment' in doc.createRange();

function createFragmentFromTemplate(str) {
  var template = doc.createElement('template');
  template.innerHTML = str;
  return template.content.childNodes[0];
}

function createFragmentFromRange(str) {
  if (!range) {
    range = doc.createRange();
    range.selectNode(doc.body);
  }

  var fragment = range.createContextualFragment(str);
  return fragment.childNodes[0];
}

function createFragmentFromWrap(str) {
  var fragment = doc.createElement('body');
  fragment.innerHTML = str;
  return fragment.childNodes[0];
}
/**
 * This is about the same
 * var html = new DOMParser().parseFromString(str, 'text/html');
 * return html.body.firstChild;
 *
 * @method toElement
 * @param {String} str
 */


function toElement(str) {
  str = str.trim();

  if (HAS_TEMPLATE_SUPPORT) {
    // avoid restrictions on content for things like `<tr><th>Hi</th></tr>` which
    // createContextualFragment doesn't support
    // <template> support not available in IE
    return createFragmentFromTemplate(str);
  } else if (HAS_RANGE_SUPPORT) {
    return createFragmentFromRange(str);
  }

  return createFragmentFromWrap(str);
}
/**
 * Returns true if two node's names are the same.
 *
 * NOTE: We don't bother checking `namespaceURI` because you will never find two HTML elements with the same
 *       nodeName and different namespace URIs.
 *
 * @param {Element} a
 * @param {Element} b The target element
 * @return {boolean}
 */


function compareNodeNames(fromEl, toEl) {
  var fromNodeName = fromEl.nodeName;
  var toNodeName = toEl.nodeName;

  if (fromNodeName === toNodeName) {
    return true;
  }

  if (toEl.actualize && fromNodeName.charCodeAt(0) < 91 &&
  /* from tag name is upper case */
  toNodeName.charCodeAt(0) > 90
  /* target tag name is lower case */
  ) {
      // If the target element is a virtual DOM node then we may need to normalize the tag name
      // before comparing. Normal HTML elements that are in the "http://www.w3.org/1999/xhtml"
      // are converted to upper case
      return fromNodeName === toNodeName.toUpperCase();
    } else {
    return false;
  }
}
/**
 * Create an element, optionally with a known namespace URI.
 *
 * @param {string} name the element name, e.g. 'div' or 'svg'
 * @param {string} [namespaceURI] the element's namespace URI, i.e. the value of
 * its `xmlns` attribute or its inferred namespace.
 *
 * @return {Element}
 */


function createElementNS(name, namespaceURI) {
  return !namespaceURI || namespaceURI === NS_XHTML ? doc.createElement(name) : doc.createElementNS(namespaceURI, name);
}
/**
 * Copies the children of one DOM element to another DOM element
 */


function moveChildren(fromEl, toEl) {
  var curChild = fromEl.firstChild;

  while (curChild) {
    var nextChild = curChild.nextSibling;
    toEl.appendChild(curChild);
    curChild = nextChild;
  }

  return toEl;
}

function syncBooleanAttrProp(fromEl, toEl, name) {
  if (fromEl[name] !== toEl[name]) {
    fromEl[name] = toEl[name];

    if (fromEl[name]) {
      fromEl.setAttribute(name, '');
    } else {
      fromEl.removeAttribute(name);
    }
  }
}

var specialElHandlers = {
  OPTION: function (fromEl, toEl) {
    var parentNode = fromEl.parentNode;

    if (parentNode) {
      var parentName = parentNode.nodeName.toUpperCase();

      if (parentName === 'OPTGROUP') {
        parentNode = parentNode.parentNode;
        parentName = parentNode && parentNode.nodeName.toUpperCase();
      }

      if (parentName === 'SELECT' && !parentNode.hasAttribute('multiple')) {
        if (fromEl.hasAttribute('selected') && !toEl.selected) {
          // Workaround for MS Edge bug where the 'selected' attribute can only be
          // removed if set to a non-empty value:
          // https://developer.microsoft.com/en-us/microsoft-edge/platform/issues/12087679/
          fromEl.setAttribute('selected', 'selected');
          fromEl.removeAttribute('selected');
        } // We have to reset select element's selectedIndex to -1, otherwise setting
        // fromEl.selected using the syncBooleanAttrProp below has no effect.
        // The correct selectedIndex will be set in the SELECT special handler below.


        parentNode.selectedIndex = -1;
      }
    }

    syncBooleanAttrProp(fromEl, toEl, 'selected');
  },

  /**
   * The "value" attribute is special for the <input> element since it sets
   * the initial value. Changing the "value" attribute without changing the
   * "value" property will have no effect since it is only used to the set the
   * initial value.  Similar for the "checked" attribute, and "disabled".
   */
  INPUT: function (fromEl, toEl) {
    syncBooleanAttrProp(fromEl, toEl, 'checked');
    syncBooleanAttrProp(fromEl, toEl, 'disabled');

    if (fromEl.value !== toEl.value) {
      fromEl.value = toEl.value;
    }

    if (!toEl.hasAttribute('value')) {
      fromEl.removeAttribute('value');
    }
  },
  TEXTAREA: function (fromEl, toEl) {
    var newValue = toEl.value;

    if (fromEl.value !== newValue) {
      fromEl.value = newValue;
    }

    var firstChild = fromEl.firstChild;

    if (firstChild) {
      // Needed for IE. Apparently IE sets the placeholder as the
      // node value and vise versa. This ignores an empty update.
      var oldValue = firstChild.nodeValue;

      if (oldValue == newValue || !newValue && oldValue == fromEl.placeholder) {
        return;
      }

      firstChild.nodeValue = newValue;
    }
  },
  SELECT: function (fromEl, toEl) {
    if (!toEl.hasAttribute('multiple')) {
      var selectedIndex = -1;
      var i = 0; // We have to loop through children of fromEl, not toEl since nodes can be moved
      // from toEl to fromEl directly when morphing.
      // At the time this special handler is invoked, all children have already been morphed
      // and appended to / removed from fromEl, so using fromEl here is safe and correct.

      var curChild = fromEl.firstChild;
      var optgroup;
      var nodeName;

      while (curChild) {
        nodeName = curChild.nodeName && curChild.nodeName.toUpperCase();

        if (nodeName === 'OPTGROUP') {
          optgroup = curChild;
          curChild = optgroup.firstChild;
        } else {
          if (nodeName === 'OPTION') {
            if (curChild.hasAttribute('selected')) {
              selectedIndex = i;
              break;
            }

            i++;
          }

          curChild = curChild.nextSibling;

          if (!curChild && optgroup) {
            curChild = optgroup.nextSibling;
            optgroup = null;
          }
        }
      }

      fromEl.selectedIndex = selectedIndex;
    }
  }
};
var ELEMENT_NODE = 1;
var DOCUMENT_FRAGMENT_NODE$1 = 11;
var TEXT_NODE = 3;
var COMMENT_NODE = 8;

function noop() {}

function defaultGetNodeKey(node) {
  return node.id;
}

function morphdomFactory(morphAttrs) {
  return function morphdom(fromNode, toNode, options) {
    if (!options) {
      options = {};
    }

    if (typeof toNode === 'string') {
      if (fromNode.nodeName === '#document' || fromNode.nodeName === 'HTML') {
        var toNodeHtml = toNode;
        toNode = doc.createElement('html');
        toNode.innerHTML = toNodeHtml;
      } else {
        toNode = toElement(toNode);
      }
    }

    var getNodeKey = options.getNodeKey || defaultGetNodeKey;
    var onBeforeNodeAdded = options.onBeforeNodeAdded || noop;
    var onNodeAdded = options.onNodeAdded || noop;
    var onBeforeElUpdated = options.onBeforeElUpdated || noop;
    var onElUpdated = options.onElUpdated || noop;
    var onBeforeNodeDiscarded = options.onBeforeNodeDiscarded || noop;
    var onNodeDiscarded = options.onNodeDiscarded || noop;
    var onBeforeElChildrenUpdated = options.onBeforeElChildrenUpdated || noop;
    var childrenOnly = options.childrenOnly === true; // This object is used as a lookup to quickly find all keyed elements in the original DOM tree.

    var fromNodesLookup = Object.create(null);
    var keyedRemovalList = [];

    function addKeyedRemoval(key) {
      keyedRemovalList.push(key);
    }

    function walkDiscardedChildNodes(node, skipKeyedNodes) {
      if (node.nodeType === ELEMENT_NODE) {
        var curChild = node.firstChild;

        while (curChild) {
          var key = undefined;

          if (skipKeyedNodes && (key = getNodeKey(curChild))) {
            // If we are skipping keyed nodes then we add the key
            // to a list so that it can be handled at the very end.
            addKeyedRemoval(key);
          } else {
            // Only report the node as discarded if it is not keyed. We do this because
            // at the end we loop through all keyed elements that were unmatched
            // and then discard them in one final pass.
            onNodeDiscarded(curChild);

            if (curChild.firstChild) {
              walkDiscardedChildNodes(curChild, skipKeyedNodes);
            }
          }

          curChild = curChild.nextSibling;
        }
      }
    }
    /**
     * Removes a DOM node out of the original DOM
     *
     * @param  {Node} node The node to remove
     * @param  {Node} parentNode The nodes parent
     * @param  {Boolean} skipKeyedNodes If true then elements with keys will be skipped and not discarded.
     * @return {undefined}
     */


    function removeNode(node, parentNode, skipKeyedNodes) {
      if (onBeforeNodeDiscarded(node) === false) {
        return;
      }

      if (parentNode) {
        parentNode.removeChild(node);
      }

      onNodeDiscarded(node);
      walkDiscardedChildNodes(node, skipKeyedNodes);
    } // // TreeWalker implementation is no faster, but keeping this around in case this changes in the future
    // function indexTree(root) {
    //     var treeWalker = document.createTreeWalker(
    //         root,
    //         NodeFilter.SHOW_ELEMENT);
    //
    //     var el;
    //     while((el = treeWalker.nextNode())) {
    //         var key = getNodeKey(el);
    //         if (key) {
    //             fromNodesLookup[key] = el;
    //         }
    //     }
    // }
    // // NodeIterator implementation is no faster, but keeping this around in case this changes in the future
    //
    // function indexTree(node) {
    //     var nodeIterator = document.createNodeIterator(node, NodeFilter.SHOW_ELEMENT);
    //     var el;
    //     while((el = nodeIterator.nextNode())) {
    //         var key = getNodeKey(el);
    //         if (key) {
    //             fromNodesLookup[key] = el;
    //         }
    //     }
    // }


    function indexTree(node) {
      if (node.nodeType === ELEMENT_NODE || node.nodeType === DOCUMENT_FRAGMENT_NODE$1) {
        var curChild = node.firstChild;

        while (curChild) {
          var key = getNodeKey(curChild);

          if (key) {
            fromNodesLookup[key] = curChild;
          } // Walk recursively


          indexTree(curChild);
          curChild = curChild.nextSibling;
        }
      }
    }

    indexTree(fromNode);

    function handleNodeAdded(el) {
      onNodeAdded(el);
      var curChild = el.firstChild;

      while (curChild) {
        var nextSibling = curChild.nextSibling;
        var key = getNodeKey(curChild);

        if (key) {
          var unmatchedFromEl = fromNodesLookup[key];

          if (unmatchedFromEl && compareNodeNames(curChild, unmatchedFromEl)) {
            curChild.parentNode.replaceChild(unmatchedFromEl, curChild);
            morphEl(unmatchedFromEl, curChild);
          }
        }

        handleNodeAdded(curChild);
        curChild = nextSibling;
      }
    }

    function cleanupFromEl(fromEl, curFromNodeChild, curFromNodeKey) {
      // We have processed all of the "to nodes". If curFromNodeChild is
      // non-null then we still have some from nodes left over that need
      // to be removed
      while (curFromNodeChild) {
        var fromNextSibling = curFromNodeChild.nextSibling;

        if (curFromNodeKey = getNodeKey(curFromNodeChild)) {
          // Since the node is keyed it might be matched up later so we defer
          // the actual removal to later
          addKeyedRemoval(curFromNodeKey);
        } else {
          // NOTE: we skip nested keyed nodes from being removed since there is
          //       still a chance they will be matched up later
          removeNode(curFromNodeChild, fromEl, true
          /* skip keyed nodes */
          );
        }

        curFromNodeChild = fromNextSibling;
      }
    }

    function morphEl(fromEl, toEl, childrenOnly) {
      var toElKey = getNodeKey(toEl);

      if (toElKey) {
        // If an element with an ID is being morphed then it will be in the final
        // DOM so clear it out of the saved elements collection
        delete fromNodesLookup[toElKey];
      }

      if (!childrenOnly) {
        // optional
        if (onBeforeElUpdated(fromEl, toEl) === false) {
          return;
        } // update attributes on original DOM element first


        morphAttrs(fromEl, toEl); // optional

        onElUpdated(fromEl);

        if (onBeforeElChildrenUpdated(fromEl, toEl) === false) {
          return;
        }
      }

      if (fromEl.nodeName !== 'TEXTAREA') {
        morphChildren(fromEl, toEl);
      } else {
        specialElHandlers.TEXTAREA(fromEl, toEl);
      }
    }

    function morphChildren(fromEl, toEl) {
      var curToNodeChild = toEl.firstChild;
      var curFromNodeChild = fromEl.firstChild;
      var curToNodeKey;
      var curFromNodeKey;
      var fromNextSibling;
      var toNextSibling;
      var matchingFromEl; // walk the children

      outer: while (curToNodeChild) {
        toNextSibling = curToNodeChild.nextSibling;
        curToNodeKey = getNodeKey(curToNodeChild); // walk the fromNode children all the way through

        while (curFromNodeChild) {
          fromNextSibling = curFromNodeChild.nextSibling;

          if (curToNodeChild.isSameNode && curToNodeChild.isSameNode(curFromNodeChild)) {
            curToNodeChild = toNextSibling;
            curFromNodeChild = fromNextSibling;
            continue outer;
          }

          curFromNodeKey = getNodeKey(curFromNodeChild);
          var curFromNodeType = curFromNodeChild.nodeType; // this means if the curFromNodeChild doesnt have a match with the curToNodeChild

          var isCompatible = undefined;

          if (curFromNodeType === curToNodeChild.nodeType) {
            if (curFromNodeType === ELEMENT_NODE) {
              // Both nodes being compared are Element nodes
              if (curToNodeKey) {
                // The target node has a key so we want to match it up with the correct element
                // in the original DOM tree
                if (curToNodeKey !== curFromNodeKey) {
                  // The current element in the original DOM tree does not have a matching key so
                  // let's check our lookup to see if there is a matching element in the original
                  // DOM tree
                  if (matchingFromEl = fromNodesLookup[curToNodeKey]) {
                    if (fromNextSibling === matchingFromEl) {
                      // Special case for single element removals. To avoid removing the original
                      // DOM node out of the tree (since that can break CSS transitions, etc.),
                      // we will instead discard the current node and wait until the next
                      // iteration to properly match up the keyed target element with its matching
                      // element in the original tree
                      isCompatible = false;
                    } else {
                      // We found a matching keyed element somewhere in the original DOM tree.
                      // Let's move the original DOM node into the current position and morph
                      // it.
                      // NOTE: We use insertBefore instead of replaceChild because we want to go through
                      // the `removeNode()` function for the node that is being discarded so that
                      // all lifecycle hooks are correctly invoked
                      fromEl.insertBefore(matchingFromEl, curFromNodeChild); // fromNextSibling = curFromNodeChild.nextSibling;

                      if (curFromNodeKey) {
                        // Since the node is keyed it might be matched up later so we defer
                        // the actual removal to later
                        addKeyedRemoval(curFromNodeKey);
                      } else {
                        // NOTE: we skip nested keyed nodes from being removed since there is
                        //       still a chance they will be matched up later
                        removeNode(curFromNodeChild, fromEl, true
                        /* skip keyed nodes */
                        );
                      }

                      curFromNodeChild = matchingFromEl;
                    }
                  } else {
                    // The nodes are not compatible since the "to" node has a key and there
                    // is no matching keyed node in the source tree
                    isCompatible = false;
                  }
                }
              } else if (curFromNodeKey) {
                // The original has a key
                isCompatible = false;
              }

              isCompatible = isCompatible !== false && compareNodeNames(curFromNodeChild, curToNodeChild);

              if (isCompatible) {
                // We found compatible DOM elements so transform
                // the current "from" node to match the current
                // target DOM node.
                // MORPH
                morphEl(curFromNodeChild, curToNodeChild);
              }
            } else if (curFromNodeType === TEXT_NODE || curFromNodeType == COMMENT_NODE) {
              // Both nodes being compared are Text or Comment nodes
              isCompatible = true; // Simply update nodeValue on the original node to
              // change the text value

              if (curFromNodeChild.nodeValue !== curToNodeChild.nodeValue) {
                curFromNodeChild.nodeValue = curToNodeChild.nodeValue;
              }
            }
          }

          if (isCompatible) {
            // Advance both the "to" child and the "from" child since we found a match
            // Nothing else to do as we already recursively called morphChildren above
            curToNodeChild = toNextSibling;
            curFromNodeChild = fromNextSibling;
            continue outer;
          } // No compatible match so remove the old node from the DOM and continue trying to find a
          // match in the original DOM. However, we only do this if the from node is not keyed
          // since it is possible that a keyed node might match up with a node somewhere else in the
          // target tree and we don't want to discard it just yet since it still might find a
          // home in the final DOM tree. After everything is done we will remove any keyed nodes
          // that didn't find a home


          if (curFromNodeKey) {
            // Since the node is keyed it might be matched up later so we defer
            // the actual removal to later
            addKeyedRemoval(curFromNodeKey);
          } else {
            // NOTE: we skip nested keyed nodes from being removed since there is
            //       still a chance they will be matched up later
            removeNode(curFromNodeChild, fromEl, true
            /* skip keyed nodes */
            );
          }

          curFromNodeChild = fromNextSibling;
        } // END: while(curFromNodeChild) {}
        // If we got this far then we did not find a candidate match for
        // our "to node" and we exhausted all of the children "from"
        // nodes. Therefore, we will just append the current "to" node
        // to the end


        if (curToNodeKey && (matchingFromEl = fromNodesLookup[curToNodeKey]) && compareNodeNames(matchingFromEl, curToNodeChild)) {
          fromEl.appendChild(matchingFromEl); // MORPH

          morphEl(matchingFromEl, curToNodeChild);
        } else {
          var onBeforeNodeAddedResult = onBeforeNodeAdded(curToNodeChild);

          if (onBeforeNodeAddedResult !== false) {
            if (onBeforeNodeAddedResult) {
              curToNodeChild = onBeforeNodeAddedResult;
            }

            if (curToNodeChild.actualize) {
              curToNodeChild = curToNodeChild.actualize(fromEl.ownerDocument || doc);
            }

            fromEl.appendChild(curToNodeChild);
            handleNodeAdded(curToNodeChild);
          }
        }

        curToNodeChild = toNextSibling;
        curFromNodeChild = fromNextSibling;
      }

      cleanupFromEl(fromEl, curFromNodeChild, curFromNodeKey);
      var specialElHandler = specialElHandlers[fromEl.nodeName];

      if (specialElHandler) {
        specialElHandler(fromEl, toEl);
      }
    } // END: morphChildren(...)


    var morphedNode = fromNode;
    var morphedNodeType = morphedNode.nodeType;
    var toNodeType = toNode.nodeType;

    if (!childrenOnly) {
      // Handle the case where we are given two DOM nodes that are not
      // compatible (e.g. <div> --> <span> or <div> --> TEXT)
      if (morphedNodeType === ELEMENT_NODE) {
        if (toNodeType === ELEMENT_NODE) {
          if (!compareNodeNames(fromNode, toNode)) {
            onNodeDiscarded(fromNode);
            morphedNode = moveChildren(fromNode, createElementNS(toNode.nodeName, toNode.namespaceURI));
          }
        } else {
          // Going from an element node to a text node
          morphedNode = toNode;
        }
      } else if (morphedNodeType === TEXT_NODE || morphedNodeType === COMMENT_NODE) {
        // Text or comment node
        if (toNodeType === morphedNodeType) {
          if (morphedNode.nodeValue !== toNode.nodeValue) {
            morphedNode.nodeValue = toNode.nodeValue;
          }

          return morphedNode;
        } else {
          // Text node to something else
          morphedNode = toNode;
        }
      }
    }

    if (morphedNode === toNode) {
      // The "to node" was not compatible with the "from node" so we had to
      // toss out the "from node" and use the "to node"
      onNodeDiscarded(fromNode);
    } else {
      if (toNode.isSameNode && toNode.isSameNode(morphedNode)) {
        return;
      }

      morphEl(morphedNode, toNode, childrenOnly); // We now need to loop over any keyed nodes that might need to be
      // removed. We only do the removal if we know that the keyed node
      // never found a match. When a keyed node is matched up we remove
      // it out of fromNodesLookup and we use fromNodesLookup to determine
      // if a keyed node has been matched up or not

      if (keyedRemovalList) {
        for (var i = 0, len = keyedRemovalList.length; i < len; i++) {
          var elToRemove = fromNodesLookup[keyedRemovalList[i]];

          if (elToRemove) {
            removeNode(elToRemove, elToRemove.parentNode, false);
          }
        }
      }
    }

    if (!childrenOnly && morphedNode !== fromNode && fromNode.parentNode) {
      if (morphedNode.actualize) {
        morphedNode = morphedNode.actualize(fromNode.ownerDocument || doc);
      } // If we had to swap out the from node with a new node because the old
      // node was not compatible with the target node then we need to
      // replace the old DOM node in the original DOM tree. This is only
      // possible if the original DOM node was part of a DOM tree which
      // we know is the case if it has a parent node.


      fromNode.parentNode.replaceChild(morphedNode, fromNode);
    }

    return morphedNode;
  };
}

var morphdom = morphdomFactory(morphAttrs);

function onCompositionStart(editor) {
  editor.composing = true;
}

function onCompositionEnd(editor, event) {
  editor.composing = false;
  return onInput(editor, event);
}

function onInput(editor, event) {
  if (editor.composing) return;
  const {
    firstBlockIndex,
    lastBlockIndex
  } = getChangeIndexes(editor, event);
  const firstBlock = editor.element.children[firstBlockIndex];
  const caretStart = event.target === editor.element ? editor.selection.anchorOffset : -1;
  const text = getText(firstBlock);
  editor.update(getNewState(editor, firstBlockIndex, lastBlockIndex, text), [firstBlockIndex, caretStart]);
  return true;
}

function onDragstart(editor, event) {
  event.preventDefault();
}

function onBeforeDelete(editor, event, type) {
  const {
    firstBlock,
    lastBlock,
    firstOffset
  } = orderedSelection(editor.selection);
  const {
    isCollapsed
  } = editor.element.getRootNode().getSelection(); // Selection

  if (!isCollapsed) {
    event.preventDefault();
    replaceSelection(editor);
    return true;
  }

  const text = serializeState(editor.state[firstBlock].content);
  const backwards = event.inputType.endsWith('Backward'); // Ignore removing past beginning/end

  if (backwards && firstOffset === 0 && firstBlock === 0 || !backwards && firstOffset === text.length && lastBlock === editor.state.length - 1) return false;
  const changePosition = backwards ? firstOffset - 1 : firstOffset; // Let browser handle everything but removing line breaks

  if (text[changePosition]) return false;
  event.preventDefault();

  if (type === 'character') {
    const nextBlock = backwards ? firstBlock - 1 : firstBlock + 1;
    const newText = serializeState(editor.state[nextBlock].content);
    editor.update(getNewState(editor, backwards ? firstBlock - 1 : firstBlock, backwards ? firstBlock : firstBlock + 1, backwards ? newText + text : text + newText), backwards ? [firstBlock - 1, newText.length] : [firstBlock, text.length]);
  }

  return true;
}

function onBeforeInput(editor, event) {
  const types = {
    deleteContentBackward: 'character',
    deleteContentForward: 'character',
    deleteWordBackward: 'word',
    deleteWordForward: 'word',
    deleteSoftLineBackward: 'line',
    deleteSoftLineForward: 'line',
    deleteHardLineBackward: 'line',
    deleteHardLineForward: 'line'
  };
  const type = types[event.inputType];
  if (!type) return;
  return onBeforeDelete(editor, event, type);
}

function onCopy(editor, event) {
  const {
    isCollapsed
  } = editor.element.getRootNode().getSelection();
  if (isCollapsed) return;
  const {
    firstBlock,
    lastBlock,
    firstOffset,
    lastOffset
  } = orderedSelection(editor.selection);
  const blocks = editor.state.slice(firstBlock, lastBlock + 1).map(block => serializeState(block.content));
  const lastBlockLength = blocks[blocks.length - 1].length;
  const selection = blocks.join('\n').slice(firstOffset, lastOffset - lastBlockLength || Infinity);
  event.preventDefault();
  event.clipboardData.setData('text/plain', selection);
  return true;
}

function onPaste(editor, event) {
  event.preventDefault();
  replaceSelection(editor, event.clipboardData.getData('text'));
  return true;
}

function onSelectionChange(editor) {
  const sel = editor.element.getRootNode().getSelection(); // Focus outside editor

  if (!editor.element.contains(sel.anchorNode)) return;
  editor.selection.anchorBlock = findBlockIndex(editor.element, sel.anchorNode, sel.anchorOffset);
  editor.selection.focusBlock = findBlockIndex(editor.element, sel.focusNode, sel.focusOffset);
}
/**
 * Correct caret position if the line is now in a prior block
 */


function updateCaret(editor, state, [block, offset]) {
  let lineIndex = editor.state.slice(0, block + 1).reduce((acc, val) => acc + val.length, 0);
  const newBlock = state.findIndex(block => {
    if (lineIndex <= block.length) return true;
    lineIndex -= block.length;
    return false;
  });
  if (newBlock === -1) return;
  if (newBlock >= block) return;
  const newOffset = serializeState(state[newBlock].content).split('\n').slice(0, block - newBlock).join('\n').length + 1 + offset;
  return [newBlock, newOffset];
}

function onBeforeUpdate(editor, state, caret) {
  if (!editor.state.length) return;
  const anchor = updateCaret(editor, state, caret.anchor);
  const focus = updateCaret(editor, state, caret.focus);
  if (!anchor && !focus) return;
  return {
    state,
    caret: {
      anchor: anchor || caret.anchor,
      focus: focus || caret.focus
    }
  };
}

var defaultPlugin = {
  handlers: {
    input: onInput,
    compositionstart: onCompositionStart,
    compositionend: onCompositionEnd,
    dragstart: onDragstart,
    beforeinput: onBeforeInput,
    copy: onCopy,
    paste: onPaste,
    selectionchange: onSelectionChange
  },
  beforeupdate: onBeforeUpdate
};

const mac = /Mac/i.test(navigator.platform);
const android = /android/i.test(navigator.userAgent);
const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
const firefox = /Firefox/.test(navigator.userAgent);
const safari = /Apple Computer/.test(navigator.vendor);

/**
 * @param {String[]} acc
 * @returns {String}
 */

function normalizeKeys(acc) {
  return acc.filter((e, i, a) => a.indexOf(e) === i).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())).join('+').toLowerCase();
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
  const {
    key
  } = event;
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


function shortcut (acc, event) {
  const shortcut = normalizeAcc(acc);
  const eventKeys = parseEventKeys(event);
  return shortcut === eventKeys;
}

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
  const beforeEvent = new InputEvent('beforeinput', {
    inputType
  });

  beforeEvent.preventDefault = () => event.preventDefault();

  return defaultPlugin.handlers.beforeinput(editor, beforeEvent);
}

var firefoxPlugin = firefox && {
  handlers: {
    keydown: onKeydown
  }
};

function onInput$1(editor, event) {
  const {
    firstBlockIndex
  } = getChangeIndexes(editor, event);
  const firstBlock = editor.element.children[firstBlockIndex];
  const caretStart = event.target === editor.element ? editor.selection.anchorOffset : -1; // While composing, only update if block type changes

  const block = editor.parser(getText(firstBlock), true).next().value;
  if (editor.composing && block.type === firstBlock.type) return; // Update entire document

  const text = Array.from(editor.element.children).map(child => getText(child)).join('\n');
  editor.update(Array.from(editor.parser(text)), [firstBlockIndex, caretStart]);
  return false;
}
/**
 * Can't be cancelled on android. Prevent default handler from being called
 */


function onBeforeInput$1() {
  return true;
}

function onCompositionEnd$1(editor, event) {
  editor.composing = false; // Don't update while selecting text

  const {
    isCollapsed
  } = editor.element.getRootNode().getSelection();
  if (isCollapsed) onInput$1(editor, event);
  return true;
}

var androidPlugin = android && {
  handlers: {
    input: onInput$1,
    beforeinput: onBeforeInput$1,
    compositionend: onCompositionEnd$1
  }
};

function toDOM(renderer, node) {
  if (typeof node === 'string') return node;
  const content = node.content && node.content.map(child => toDOM(renderer, child));
  return renderer[node.type]({
    content
  });
}

const EVENTS = ['beforeinput', 'compositionstart', 'compositionend', 'copy', 'dragstart', 'drop', 'paste', 'input', 'keydown', 'keypress'];
const DOCUMENT_EVENTS = ['selectionchange'];
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

class Editor {
  constructor({
    element,
    value = '',
    renderer = [],
    plugins = [],
    parser
  } = {}) {
    this._elements = [];
    Object.assign(this, {
      element,
      renderer,
      parser
    });
    this.plugins = [firefoxPlugin, androidPlugin, defaultPlugin, ...plugins].filter(Boolean);
    this._state = [];
    this.composing = false;

    const getTypeOffset = type => {
      const sel = this.element.getRootNode().getSelection();
      const block = this.selection[type + 'Block'];
      if (sel[type + 'Node'] === this.element) return 0;
      if (!this.element.contains(sel[type + 'Node'])) return -1;
      return getOffset(this.element.children[block], sel[type + 'Node'], sel[type + 'Offset']);
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
      caret = {
        focus: caret,
        anchor: caret.slice()
      };
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
        const el = toDOM(this.renderer, node); // Improves caret behavior when contenteditable="false"
        // is the last child or when empty

        if (!el.childNodes.length || (safari || firefox) && el.lastChild && el.lastChild.contentEditable === 'false') {
          el.append(document.createElement('br'));
        }

        const morph = !state.includes(prevState[index]);

        if (morph && this._elements[index]) {
          morphdom(this._elements[index], el);
        } else {
          this.element.insertBefore(el, current);
        }
      }
    }); // Remove leftover elements

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

const Fragment = Symbol('Fragment');
const SVG_ELEMENTS = ['svg', 'path'];
function h(tag, props, ...children) {
  if (tag === Fragment) {
    return children;
  }

  const isSvg = SVG_ELEMENTS.includes(tag);
  const el = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);

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
function cls(...str) {
  return str.filter(s => s).join(' ');
}
function last(list) {
  return list[list.length - 1];
}
/**
 * Make sure URL is absolute
 * @param {String} src
 * @returns {String}
 */

function formatURL(str) {
  try {
    return new URL(str).href;
  } catch (_) {
    return 'http://' + str.replace(/^\/{0,2}/, '');
  }
}

var styles = {"editor":"styles_editor__2cUlN","hr":"styles_hr__2riM8","ordered_list_item":"styles_ordered_list_item__QkxGk","ordered_list_item_number":"styles_ordered_list_item_number___vpU2","ordered_list_item_dot":"styles_ordered_list_item_dot__3JLgA","unordered_list_item":"styles_unordered_list_item__337AX","unordered_list_item_dot":"styles_unordered_list_item_dot___f6Ay","p":"styles_p__1ynuX","code_block":"styles_code_block__2trJg","code_language":"styles_code_language__355v9","code_close":"styles_code_close__27WtF","code_span":"styles_code_span__1v2yi","code_span_open":"styles_code_span_open__2k_16","code_span_close":"styles_code_span_close__J7Kcr","code_span_inner":"styles_code_span_inner__1150f","mark":"styles_mark__3K7Jz","mark_markup":"styles_mark_markup__19lhc","reference":"styles_reference__4iXBu","heading":"styles_heading__3prGF","h1":"styles_h1__27o1z","h2":"styles_h2__3jJOu","h3":"styles_h3__2gQv8","heading_button":"styles_heading_button__2MjOt","heading_button_level":"styles_heading_button_level__3LHEs","inline_markup":"styles_inline_markup__3RXRG","icon":"styles_icon__2OPJv","link":"styles_link__21ze7","link_open":"styles_link_open__fihtT","link_close":"styles_link_close__rxtZ7","link_button":"styles_link_button__2gsrO","link_nowrap":"styles_link_nowrap__3vXQ1","tag":"styles_tag__Cqlpx","tag_markup":"styles_tag_markup__3nfCQ","underline":"styles_underline__EwtOc","strikethrough":"styles_strikethrough__1tC1O","blockquote":"styles_blockquote__2usg4","blockquote_markup":"styles_blockquote_markup__2HR2m","todo_item":"styles_todo_item__2uUw1","todo_item_done":"styles_todo_item_done__3Dv5E","checkbox":"styles_checkbox__2hixQ","checkbox_svg":"styles_checkbox_svg__25_yY","checkbox_background":"styles_checkbox_background__bFEIS","image":"styles_image__3uMnD","file":"styles_file__2XDG9","file_svg":"styles_file_svg__3FzYI"};

/**
 * In-memory map of files
 */
const MAP = {};
function get(id) {
  return MAP[id];
}
function set(id, url) {
  MAP[id] = url;
}

/** @jsx h */

function onTodoClick({
  target
}) {
  const checked = target.getAttribute('aria-checked') === 'true';
  target.dataset.text = `- [${!checked ? 'x' : ' '}]`;
  target.dispatchEvent(new Event('input', {
    bubbles: true
  }));
}

function preventDefault(event) {
  event.preventDefault();
}

function onTagClick(event) {
  console.log('Tag click', event);
}

function onHeadingClick(event) {
  console.log('Heading click', event);
}

function onLinkClick() {
  const href = formatURL(this.getAttribute('href'));
  window.open(href, '_blank');
}

function onLinkButtonClick(event) {
  console.log('Link button click', event);
}

function selectElement() {
  const selection = this.getRootNode().getSelection();
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNode(this);
  selection.addRange(range);
}

var renderer = {
  paragraph({
    content
  }) {
    return h("p", {
      class: styles.p
    }, content);
  },

  heading({
    content: [hashes, ...content]
  }) {
    const level = hashes.length;
    const Heading = `h${level}`;
    return h(Heading, {
      class: cls(styles.heading, styles[Heading])
    }, h("button", {
      contenteditable: "false",
      type: "button",
      class: styles.heading_button,
      "data-text": hashes,
      onclick: onHeadingClick,
      onmousedown: preventDefault
      /* Prevent editor focus on mobile */

    }, h("div", null, "h", h("span", {
      class: styles.heading_button_level
    }, level))), content);
  },

  ordered_list_item({
    content: [indentation, level, markup, ...content]
  }) {
    return h("li", {
      class: styles.ordered_list_item
    }, indentation, h("span", {
      class: styles.ordered_list_item_number
    }, level), h("span", {
      class: styles.ordered_list_item_dot
    }, markup), content);
  },

  unordered_list_item({
    content: [indentation, markup, ...content]
  }) {
    return h("li", {
      class: styles.unordered_list_item
    }, indentation, h("span", {
      class: styles.unordered_list_item_dot
    }, markup), content);
  },

  todo_item({
    content: [indentation, text, space, ...content]
  }) {
    const checked = text === '- [x]';
    return h("li", {
      class: styles.todo_item
    }, indentation, h("button", {
      contenteditable: "false",
      type: "button",
      role: "checkbox",
      "aria-checked": checked,
      class: styles.checkbox,
      "data-text": text,
      onclick: onTodoClick,
      onmousedown: preventDefault
      /* Prevent editor focus on mobile */

    }, h("div", {
      class: styles.checkbox_svg
    }, String.fromCharCode(8203), h("svg", {
      width: "17",
      height: "17",
      viewBox: "0 0 16 16"
    }, h("path", {
      d: "M.5 12.853A2.647 2.647 0 003.147 15.5h9.706a2.647 2.647 0 002.647-2.647V3.147A2.647 2.647 0 0012.853.5H3.147A2.647 2.647 0 00.5 3.147v9.706z",
      class: styles.checkbox_background
    }), checked ? h("path", {
      d: "M12.526 4.615L6.636 9.58l-2.482-.836a.48.48 0 00-.518.15.377.377 0 00.026.495l2.722 2.91c.086.09.21.144.34.144h.046a.474.474 0 00.307-.156l6.1-7.125a.38.38 0 00-.046-.548.49.49 0 00-.604 0z",
      class: styles.icon
    }) : ''))), space, h("span", {
      class: checked ? styles.todo_item_done : ''
    }, content));
  },

  blockquote({
    content: [markup, ...content]
  }) {
    return h("blockquote", {
      class: styles.blockquote
    }, h("span", {
      class: styles.blockquote_markup
    }, markup), content);
  },

  horizontal_rule({
    content
  }) {
    return (
      /* Enables caret positions */
      h("p", {
        class: styles.p
      }, h("img", {
        role: "presentation",
        class: styles.hr,
        "data-text": content
      }))
    );
  },

  code_block({
    content: [openMarkup, language, ...content]
  }) {
    return h("code", {
      class: styles.code_block,
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false"
    }, h("span", {
      class: styles.inline_markup
    }, openMarkup), h("span", {
      class: styles.code_language
    }, language), content.slice(0, -1), h("span", {
      class: cls(styles.inline_markup, styles.code_close)
    }, last(content)));
  },

  em({
    content
  }) {
    return h(Fragment, null, h("span", {
      class: styles.inline_markup
    }, content[0]), h("em", null, content.slice(1, -1)), h("span", {
      class: styles.inline_markup
    }, last(content)));
  },

  strong({
    content
  }) {
    return h(Fragment, null, h("span", {
      class: styles.inline_markup
    }, content[0]), h("strong", null, content.slice(1, -1)), h("span", {
      class: styles.inline_markup
    }, last(content)));
  },

  link({
    content: [openBrckt, text, closeBrckt, openPar, link, closePar]
  }) {
    return h(Fragment, null, h("span", {
      class: cls(styles.inline_markup, styles.link_open)
    }, openBrckt), h("a", {
      href: link,
      target: "_blank",
      class: styles.link,
      onclick: onLinkClick
    }, text), h("span", {
      class: cls(styles.inline_markup, styles.link_close)
    }, closeBrckt), h("span", {
      class: styles.link_nowrap
    }, h("span", {
      class: styles.inline_markup
    }, openPar), h("button", {
      contenteditable: "false",
      type: "button",
      "data-text": link,
      class: styles.link_button,
      onclick: onLinkButtonClick,
      onmousedown: preventDefault
      /* Prevent editor focus on mobile */

    }, h("svg", {
      width: "12",
      height: "12",
      viewBox: "0 0 14 14"
    }, h("path", {
      d: "M10.593 1.17a2.305 2.305 0 00-1.667.691l-.003.002-.964.975c-.525.53-.864 1.096-1.006 1.557-.152.493-.038.684.014.73l-.806.89c-.575-.522-.555-1.324-.355-1.974.21-.682.67-1.41 1.3-2.047l.964-.974a3.505 3.505 0 014.923-.08l.002-.001.002.001.068.07.054.057-.003.003a3.62 3.62 0 01-.2 4.97l-.875.85c-.707.689-1.6 1.002-2.293 1.138a5.128 5.128 0 01-.91.098c-.12.001-.23-.003-.322-.014a1.176 1.176 0 01-.153-.026.635.635 0 01-.327-.186l.875-.822a.565.565 0 00-.261-.158c.03.003.09.007.175.006.171-.002.415-.021.692-.076.564-.11 1.207-.352 1.686-.819l.875-.85a2.42 2.42 0 00.097-3.363 2.306 2.306 0 00-1.582-.649z M10.848 4L4 10.848 3.151 10 10 3.151l.848.849z M3.968 5.84c.62-.217 1.42-.298 1.955.235l-.846.85c-.02-.02-.2-.132-.714.048-.467.163-1.04.519-1.58 1.05l-.872.854a2.28 2.28 0 00.793 3.772 2.37 2.37 0 002.58-.592l.732-.782c.459-.49.701-1.151.817-1.732.056-.285.08-.536.086-.713.003-.09.001-.154 0-.19l-.002-.016v.007a.436.436 0 00.043.13.586.586 0 00.116.163l.848-.848c.113.112.15.242.154.258v.001c.013.04.02.075.023.097.008.046.012.093.015.133.005.085.006.19.002.307a5.766 5.766 0 01-.109.905c-.138.697-.446 1.601-1.117 2.318l-.733.782a3.57 3.57 0 01-5.04.169 3.48 3.48 0 01-.046-5.028l.869-.852C2.58 6.539 3.3 6.072 3.968 5.84z",
      class: styles.icon
    }))), h("span", {
      class: styles.inline_markup
    }, closePar)));
  },

  code({
    content
  }) {
    return h("code", {
      class: styles.code_span,
      autocomplete: "off",
      autocorrect: "off",
      autocapitalize: "off",
      spellcheck: "false"
    }, h("span", {
      class: styles.code_span_inner
    }, h("span", {
      class: styles.code_span_open
    }, content[0]), content.slice(1, -1), h("span", {
      class: styles.code_span_close
    }, last(content))));
  },

  reference({
    content
  }) {
    return h(Fragment, null, h("span", {
      class: styles.inline_markup
    }, content[0]), h("span", {
      class: styles.reference
    }, content.slice(1, -1)), h("span", {
      class: styles.inline_markup
    }, last(content)));
  },

  mark({
    content
  }) {
    return h("mark", {
      class: styles.mark
    }, h("span", {
      class: styles.mark_markup
    }, content[0]), content.slice(1, -1), h("span", {
      class: styles.mark_markup
    }, last(content)));
  },

  strikethrough({
    content
  }) {
    return h("span", {
      class: styles.strikethrough
    }, content[0], h("s", null, content.slice(1, -1)), last(content));
  },

  underline({
    content
  }) {
    return h(Fragment, null, h("span", {
      class: styles.inline_markup
    }, content[0]), h("u", {
      class: styles.underline
    }, content.slice(1, -1)), h("span", {
      class: styles.inline_markup
    }, last(content)));
  },

  tag({
    content
  }) {
    return (// <button> can't have multi-line background
      h("span", {
        role: "button",
        tabindex: "0",
        class: styles.tag,
        onclick: onTagClick
      }, h("span", {
        class: styles.tag_markup
      }, content[0]), content.slice(1, -1), h("span", {
        class: styles.tag_markup
      }, last(content)))
    );
  },

  image({
    content
  }) {
    const [id, name] = content[1].split('/');
    return h("img", {
      src: get(id),
      alt: name,
      class: styles.image,
      "data-text": content.join(''),
      onclick: selectElement
    });
  },

  file({
    content
  }) {
    const [id, name] = content[1].split('/');
    return h("button", {
      contenteditable: "false",
      type: "button",
      class: styles.file,
      "data-text": content.join(''),
      "data-name": name,
      "data-id": id,
      "data-date": "",
      onmousedown: preventDefault
      /* Prevent editor focus on mobile */
      ,
      onclick: selectElement
    }, h("div", {
      class: styles.file_svg
    }, h("svg", {
      width: "32",
      height: "38"
    }, h("path", {
      d: "M0 0h20.693L32 10.279V38H0V0zm1 1v36h30V11H19V1H1zm19 0v9h10.207l-9.9-9H20z"
    }))));
  }

};

const HEADING = /^(#{1,6}) /;
const HR = /^(-{3,}|\*{3,}|_{3,})$/;
const TODO_ITEM = /^(\s*)(- \[(?: |x)\])( )/;
const ORDERED_ITEM = /^(\s*)(\d+)(\.) /;
const UNORDERED_ITEM = /^(\s*)([*-]) /;
const BLOCKQUOTE = /^(>) /;

function matchLine(regex, type) {
  return ({
    lines,
    index,
    parseInline
  }) => {
    const line = lines[index];
    const match = regex.exec(line);
    if (!match) return;
    const matches = match.slice(1);
    return {
      type,
      content: [...matches, ...parseInline(line.slice(matches.join('').length))],
      length: 1
    };
  };
}

const heading = matchLine(HEADING, 'heading');
const horizontal_rule = matchLine(HR, 'horizontal_rule');
const todo_item = matchLine(TODO_ITEM, 'todo_item');
const ordered_list = matchLine(ORDERED_ITEM, 'ordered_list_item');
const unordered_list = matchLine(UNORDERED_ITEM, 'unordered_list_item');
const blockquote = matchLine(BLOCKQUOTE, 'blockquote');
function paragraph({
  lines,
  index,
  parseInline
}) {
  return {
    type: 'paragraph',
    content: parseInline(lines[index]),
    length: 1
  };
}

const WHITESPACE = /\s/;

function findCloseIndex(state, match) {
  for (let n = state.index + match.length; n < state.string.length; n++) {
    const char = state.string.substring(n, n + match.length);

    if (char === match && !WHITESPACE.test(state.string[n - 1])) {
      return n;
    }
  }

  return -1;
}

function getChars(chars) {
  if (typeof chars === 'string') {
    return {
      open: chars,
      close: chars
    };
  }

  return chars;
}

function matchChars(CHARS, state, index) {
  for (const chars of CHARS) {
    const chars2 = getChars(chars);
    const slice = state.string.substring(index, index + chars2.open.length);
    if (slice === chars2.open) return chars2;
  }
}

function create(CHARS, type, richContent = true, contentRequired = false) {
  return function (state) {
    const char = matchChars(CHARS, state, state.index);
    if (!char) return false;
    const nextChar = state.string[state.index + char.open.length];
    if (!nextChar || WHITESPACE.test(nextChar)) return false;
    const closeIndex = findCloseIndex(state, char.close);
    if (closeIndex === -1) return false;
    if (contentRequired && closeIndex === state.index + 1) return false;
    const content = richContent ? state.parse(state.index + char.open.length, closeIndex) : [state.string.slice(state.index + char.open.length, closeIndex)];
    state.tokens.push({
      type,
      content: [char.open, ...content, char.close]
    });
    state.index = closeIndex + char.close.length;
    return true;
  };
}

const em = create(['*', '_'], 'em');
const strong = create(['**', '__'], 'strong');
const underline = create(['~'], 'underline');
const strikethrough = create(['~~'], 'strikethrough');
const mark = create(['::'], 'mark');
const reference = create([{
  open: '[[',
  close: ']]'
}], 'reference');
const code = create(['`'], 'code', false);
const file = create([{
  open: '[file:',
  close: ']'
}], 'file', false);
const image = create([{
  open: '[image:',
  close: ']'
}], 'image', false);
const tag = create(['#'], 'tag', false, true);

const OPEN_BRACKET = '[';
const CLOSE_BRACKET = ']';
const OPEN_PAR = '(';
const CLOSE_PAR = ')';

function findCloseIndex$1(state, start, match) {
  for (let n = start; n < state.string.length; n++) {
    if (state.string[n] === match) return n;
  }

  return -1;
}

function link(state) {
  if (state.string[state.index] !== OPEN_BRACKET) return false;
  const closeBracketIndex = findCloseIndex$1(state, state.index, CLOSE_BRACKET);
  if (closeBracketIndex === -1) return false;
  if (state.index === closeBracketIndex - 1) return false;
  const text = state.string.slice(state.index + 1, closeBracketIndex);
  if (text.includes(OPEN_BRACKET)) return false;
  if (state.string[closeBracketIndex + 1] !== OPEN_PAR) return false;
  const closeParIndex = findCloseIndex$1(state, state.index, CLOSE_PAR);
  if (closeParIndex === -1) return false;
  const url = state.string.slice(closeBracketIndex + 2, closeParIndex);
  if (url.includes(OPEN_PAR)) return false; // No url

  if (closeBracketIndex === closeParIndex - 2) return false;
  state.tokens.push({
    type: 'link',
    content: [OPEN_BRACKET, text, CLOSE_BRACKET, OPEN_PAR, url, CLOSE_PAR]
  });
  state.index = closeParIndex + 1;
  return true;
}

const WHITESPACE$1 = /\s/;
const CHAR = '#';

function findEnd(state) {
  for (let n = state.index + 1; n < state.string.length; n++) {
    const char = state.string[n];
    if (char === CHAR || WHITESPACE$1.test(char)) return n;
  }

  return state.string.length;
}

function isSelfClosing(state, start) {
  for (let n = start; n < state.string.length; n++) {
    const char = state.string[n];

    if (char === CHAR) {
      if (!WHITESPACE$1.test(state.string[n - 1])) {
        return false;
      } else if (!WHITESPACE$1.test(state.string[n + 1])) {
        return true;
      }
    }
  }

  return true;
}
/**
 * Self-closing tag matcher
 */


function tag$1(state) {
  if (state.string[state.index] !== CHAR) return false;
  const prevChar = state.string[state.index - 1];
  if (prevChar && !WHITESPACE$1.test(prevChar)) return false;
  const nextChar = state.string[state.index + 1];
  if (!nextChar || WHITESPACE$1.test(nextChar) || nextChar === CHAR) return false;
  const endIndex = findEnd(state);
  const selfClosing = isSelfClosing(state, endIndex);
  if (!selfClosing) return false; // Closing tag without whitespace found

  const closing = state.string[endIndex - 1] === CHAR;
  const content = state.string.slice(state.index + 1, closing ? endIndex - 1 : endIndex);
  state.tokens.push({
    type: 'tag',
    content: [CHAR, content, closing ? '#' : '']
  });
  state.index = endIndex;
  return true;
}

function text(state) {
  if (typeof state.tokens[state.tokens.length - 1] !== 'string') {
    state.tokens.push('');
  }

  state.tokens[state.tokens.length - 1] += state.string[state.index];
  state.index++;
  return true;
}

const parsers = [tag$1, strong, em, strikethrough, underline, mark, reference, code, file, image, tag, link, text];
function parseInline(string) {
  const state = {
    index: 0,
    string,
    tokens: [],

    parse(start, end) {
      return parseInline(string.slice(start, end));
    }

  };

  while (state.index < string.length) {
    for (const parser of parsers) {
      const result = parser(state);
      if (result) break;
    }
  }

  return state.tokens;
}

const OPEN = /^(`{3})(.*)$/;
const CLOSE = /^`{3,}.*$/;

function findClosingLine({
  lines,
  index
}) {
  for (let n = index + 1; n < lines.length; n++) {
    if (CLOSE.test(lines[n])) return n;
  }

  return -1;
}

function code$1({
  lines,
  index
}) {
  const line = lines[index];
  let match;
  if (!(match = OPEN.exec(line))) return;
  const closingLineIndex = findClosingLine({
    lines,
    index
  });
  if (closingLineIndex === -1) return;
  const content = index + 1 === closingLineIndex ? [''] : [lines.slice(index + 1, closingLineIndex).join('\n'), '\n'];
  return {
    type: 'code_block',
    content: [match[1], match[2], '\n', ...content, lines[closingLineIndex]],
    length: closingLineIndex - index + 1
  };
}

const parsers$1 = [heading, horizontal_rule, todo_item, ordered_list, unordered_list, blockquote, code$1, paragraph];
function* parseBlock(value, typeOnly = false) {
  let index = 0;
  const lines = Array.isArray(value) ? value : value.split('\n');

  while (index < lines.length) {
    for (const parser of parsers$1) {
      const result = parser({
        parseInline: typeOnly ? string => [string] : parseInline,
        lines,
        index
      });

      if (result) {
        index += result.length;
        yield result;
        break;
      }
    }
  }
}

const PREFIXES = {
  blockquote: '> ',
  unordered_list_item: '* ',
  ordered_list_item: str => `${parseInt(str) + 1}. `,
  todo_item: '- [ ] '
};
const EMPTY_LENGTHS = {
  blockquote: 2,
  unordered_list_item: 3,
  ordered_list_item: 4,
  todo_item: 3
};

function getPrefix(block) {
  if (!Object.keys(PREFIXES).includes(block.type)) return ''; // No indentation

  if (block.type === 'blockquote') return PREFIXES.blockquote;
  const text = typeof PREFIXES[block.type] === 'function' ? PREFIXES[block.type](block.content[1]) : PREFIXES[block.type];
  return block.content[0] + text;
}

function shouldRemoveBlock(block) {
  const len = EMPTY_LENGTHS[block.type];
  return block.content.length === len && block.content[len - 1] === ' ';
}

function enterPlugin() {
  return {
    handlers: {
      keypress(editor, event) {
        // Enter
        if (event.which !== 13) return;
        event.preventDefault();
        const {
          firstBlock,
          firstOffset
        } = orderedSelection(editor.selection);
        const firstLine = serializeState(editor.state[firstBlock].content);
        const {
          isCollapsed
        } = editor.element.getRootNode().getSelection(); // Remove empty block

        if (isCollapsed && firstOffset === firstLine.length && Object.keys(PREFIXES).includes(editor.state[firstBlock].type) && shouldRemoveBlock(editor.state[firstBlock])) {
          editor.update([...editor.state.slice(0, firstBlock), // Generate block from empty line
          editor.parser('').next().value, ...editor.state.slice(firstBlock + 1)], [firstBlock, 0]);
          return true;
        }

        const prefix = event.shiftKey || event.altKey || event.ctrlKey ? '' : getPrefix(editor.state[firstBlock]);
        replaceSelection(editor, '\n' + prefix);
        return true;
      }

    }
  };
}

const INDENTABLE_BLOCKS = ['todo_item', 'ordered_list_item', 'unordered_list_item'];
const INDENTATION = /^\t| {0,4}/;

function shouldIndent(blocks) {
  return blocks.some(block => INDENTABLE_BLOCKS.includes(block.type));
}

function tabPlugin() {
  return {
    handlers: {
      keydown(editor, event) {
        // Tab
        if (event.which !== 9) return;
        if (event.metaKey || event.ctrlKey) return false;
        event.preventDefault();
        const {
          firstBlock,
          lastBlock
        } = orderedSelection(editor.selection);
        const selectedBlocks = editor.state.slice(firstBlock, lastBlock + 1);

        if (event.altKey || !shouldIndent(selectedBlocks)) {
          replaceSelection(editor, '\t');
        } else {
          const {
            anchorBlock,
            focusBlock,
            anchorOffset,
            focusOffset
          } = editor.selection;
          const offsetChange = event.shiftKey ? -1 : 1;
          const text = selectedBlocks.map(block => {
            const text = serializeState(block.content);
            if (event.shiftKey) return text.replace(INDENTATION, '');
            return '\t' + text;
          }).join('\n');
          editor.update(getNewState(editor, firstBlock, lastBlock, text), {
            anchor: [anchorBlock, anchorOffset + offsetChange],
            focus: [focusBlock, focusOffset + offsetChange]
          });
        }

        return true;
      }

    }
  };
}

function diff(str1, str2) {
  if (str1 === str2) {
    return {
      added: '',
      removed: '',
      position: -1
    };
  } // Iterate over the strings to find differences.


  let position = 0;

  while (str1[position] === str2[position]) {
    position++;
  }

  let m = 0;

  while (str1[str1.length - m] === str2[str2.length - m] && m <= str1.length - position) m++;

  m--;
  const added = str2.slice(position, str2.length - m);
  const removed = str1.substr(position, str1.length - str2.length + added.length);
  return {
    added,
    removed,
    position
  };
}

function historyPlugin() {
  const hist = [];
  let historyPosition = 0;

  function addToHistory(state) {
    hist.splice(historyPosition);
    hist.push(state);
    historyPosition = hist.length;
  }

  function undo(editor) {
    if (historyPosition <= 1) return;
    historyPosition--;
    const prevState = editor.state;
    supress = true;
    editor.state = hist[historyPosition - 1];
    supress = false;
    const blocks = editor.state.map(block => serializeState(block.content));
    let {
      added,
      position
    } = diff(serializeState(prevState, true), blocks.join('\n'));
    if (position === -1) return;
    const firstBlock = blocks.findIndex(block => {
      if (block.length >= position) return true;
      position -= block.length + 1;
      return false;
    });
    let n = position + added.length;
    const lastBlock = blocks.slice(firstBlock).findIndex(block => {
      if (block.length >= n) return true;
      n -= block.length + 1;
      return false;
    }) + firstBlock;
    setOffset(editor, {
      anchor: [firstBlock, position],
      focus: [lastBlock, n]
    });
  }

  function redo(editor) {
    if (hist.length === historyPosition) return;
    const prevState = editor.state;
    supress = true;
    editor.state = hist[historyPosition];
    supress = false;
    historyPosition++;
    const blocks = editor.state.map(block => serializeState(block.content));
    let {
      added,
      position
    } = diff(serializeState(prevState, true), blocks.join('\n'));
    if (position === -1) return;
    const firstBlock = blocks.findIndex(block => {
      if (block.length >= position) return true;
      position -= block.length + 1;
      return false;
    });
    setOffset(editor, [firstBlock, position + added.length]);
  }

  let supress = false;
  let cb;
  return {
    afterchange(editor) {
      clearTimeout(cb);

      if (!supress) {
        cb = setTimeout(() => {
          addToHistory(editor.state);
        }, 150);
      }
    },

    handlers: {
      beforeinput(editor, event) {
        if (event.inputType === 'historyUndo') undo(editor);else if (event.inputType === 'historyRedo') redo(editor);else return false;
        event.preventDefault();
        return true;
      },

      keydown(editor, event) {
        if (shortcut('Mod+Z', event)) {
          undo(editor);
        } else if (shortcut('Mod+Y', event) || shortcut('Mod+Shift+Z', event)) {
          redo(editor);
        } else {
          return false;
        }

        event.preventDefault();
        return true;
      }

    }
  };
}

var styles$1 = {"comment":"highlight_comment__2f-wM","prolog":"highlight_prolog__3CJlB","doctype":"highlight_doctype__Za9Md","cdata":"highlight_cdata__3dEyr","punctuation":"highlight_punctuation__WQRkN","namespace":"highlight_namespace__2NMge","constant":"highlight_constant__1PvKD","property":"highlight_property__1MXm8","tag":"highlight_tag__2KZ7G","boolean":"highlight_boolean__2P8j0","number":"highlight_number__jB8lB","symbol":"highlight_symbol__Rcr90","deleted":"highlight_deleted__EH86z","selector":"highlight_selector__lEXtq","attr-name":"highlight_attr-name__2823h","string":"highlight_string__-J1zS","char":"highlight_char__2omkV","builtin":"highlight_builtin__G705z","inserted":"highlight_inserted__2_81K","operator":"highlight_operator__1Y7KD","entity":"highlight_entity__1G6tQ","url":"highlight_url__1FcoA","language-css":"highlight_language-css__3WnQv","style":"highlight_style__kmZkl","atrule":"highlight_atrule__3_MEx","attr-value":"highlight_attr-value__2TDO5","keyword":"highlight_keyword__fYZUo","function":"highlight_function__fv1ja","class-name":"highlight_class-name__3TmKK","regex":"highlight_regex__27S5w","important":"highlight_important__3ESZe","variable":"highlight_variable__3NED7","bold":"highlight_bold__2AFSl","italic":"highlight_italic__3bk6G"};

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var prism = createCommonjsModule(function (module) {
/* **********************************************
     Begin prism-core.js
********************************************** */
var _self = typeof window !== 'undefined' ? window // if in browser
: typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope ? self // if in worker
: {} // if in node js
;
/**
 * Prism: Lightweight, robust, elegant syntax highlighting
 * MIT license http://www.opensource.org/licenses/mit-license.php/
 * @author Lea Verou http://lea.verou.me
 */


var Prism = function (_self) {
  // Private helper vars
  var lang = /\blang(?:uage)?-([\w-]+)\b/i;
  var uniqueId = 0;
  var _ = {
    manual: _self.Prism && _self.Prism.manual,
    disableWorkerMessageHandler: _self.Prism && _self.Prism.disableWorkerMessageHandler,
    util: {
      encode: function (tokens) {
        if (tokens instanceof Token) {
          return new Token(tokens.type, _.util.encode(tokens.content), tokens.alias);
        } else if (Array.isArray(tokens)) {
          return tokens.map(_.util.encode);
        } else {
          return tokens.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\u00a0/g, ' ');
        }
      },
      type: function (o) {
        return Object.prototype.toString.call(o).slice(8, -1);
      },
      objId: function (obj) {
        if (!obj['__id']) {
          Object.defineProperty(obj, '__id', {
            value: ++uniqueId
          });
        }

        return obj['__id'];
      },
      // Deep clone a language definition (e.g. to extend it)
      clone: function deepClone(o, visited) {
        var clone,
            id,
            type = _.util.type(o);

        visited = visited || {};

        switch (type) {
          case 'Object':
            id = _.util.objId(o);

            if (visited[id]) {
              return visited[id];
            }

            clone = {};
            visited[id] = clone;

            for (var key in o) {
              if (o.hasOwnProperty(key)) {
                clone[key] = deepClone(o[key], visited);
              }
            }

            return clone;

          case 'Array':
            id = _.util.objId(o);

            if (visited[id]) {
              return visited[id];
            }

            clone = [];
            visited[id] = clone;
            o.forEach(function (v, i) {
              clone[i] = deepClone(v, visited);
            });
            return clone;

          default:
            return o;
        }
      }
    },
    languages: {
      extend: function (id, redef) {
        var lang = _.util.clone(_.languages[id]);

        for (var key in redef) {
          lang[key] = redef[key];
        }

        return lang;
      },

      /**
       * Insert a token before another token in a language literal
       * As this needs to recreate the object (we cannot actually insert before keys in object literals),
       * we cannot just provide an object, we need an object and a key.
       * @param inside The key (or language id) of the parent
       * @param before The key to insert before.
       * @param insert Object with the key/value pairs to insert
       * @param root The object that contains `inside`. If equal to Prism.languages, it can be omitted.
       */
      insertBefore: function (inside, before, insert, root) {
        root = root || _.languages;
        var grammar = root[inside];
        var ret = {};

        for (var token in grammar) {
          if (grammar.hasOwnProperty(token)) {
            if (token == before) {
              for (var newToken in insert) {
                if (insert.hasOwnProperty(newToken)) {
                  ret[newToken] = insert[newToken];
                }
              }
            } // Do not insert token which also occur in insert. See #1525


            if (!insert.hasOwnProperty(token)) {
              ret[token] = grammar[token];
            }
          }
        }

        var old = root[inside];
        root[inside] = ret; // Update references in other language definitions

        _.languages.DFS(_.languages, function (key, value) {
          if (value === old && key != inside) {
            this[key] = ret;
          }
        });

        return ret;
      },
      // Traverse a language definition with Depth First Search
      DFS: function DFS(o, callback, type, visited) {
        visited = visited || {};
        var objId = _.util.objId;

        for (var i in o) {
          if (o.hasOwnProperty(i)) {
            callback.call(o, i, o[i], type || i);

            var property = o[i],
                propertyType = _.util.type(property);

            if (propertyType === 'Object' && !visited[objId(property)]) {
              visited[objId(property)] = true;
              DFS(property, callback, null, visited);
            } else if (propertyType === 'Array' && !visited[objId(property)]) {
              visited[objId(property)] = true;
              DFS(property, callback, i, visited);
            }
          }
        }
      }
    },
    plugins: {},
    highlightAll: function (async, callback) {
      _.highlightAllUnder(document, async, callback);
    },
    highlightAllUnder: function (container, async, callback) {
      var env = {
        callback: callback,
        selector: 'code[class*="language-"], [class*="language-"] code, code[class*="lang-"], [class*="lang-"] code'
      };

      _.hooks.run('before-highlightall', env);

      var elements = container.querySelectorAll(env.selector);

      for (var i = 0, element; element = elements[i++];) {
        _.highlightElement(element, async === true, env.callback);
      }
    },
    highlightElement: function (element, async, callback) {
      // Find language
      var language = 'none',
          grammar,
          parent = element;

      while (parent && !lang.test(parent.className)) {
        parent = parent.parentNode;
      }

      if (parent) {
        language = (parent.className.match(lang) || [, 'none'])[1].toLowerCase();
        grammar = _.languages[language];
      } // Set language on the element, if not present


      element.className = element.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;

      if (element.parentNode) {
        // Set language on the parent, for styling
        parent = element.parentNode;

        if (/pre/i.test(parent.nodeName)) {
          parent.className = parent.className.replace(lang, '').replace(/\s+/g, ' ') + ' language-' + language;
        }
      }

      var code = element.textContent;
      var env = {
        element: element,
        language: language,
        grammar: grammar,
        code: code
      };

      var insertHighlightedCode = function (highlightedCode) {
        env.highlightedCode = highlightedCode;

        _.hooks.run('before-insert', env);

        env.element.innerHTML = env.highlightedCode;

        _.hooks.run('after-highlight', env);

        _.hooks.run('complete', env);

        callback && callback.call(env.element);
      };

      _.hooks.run('before-sanity-check', env);

      if (!env.code) {
        _.hooks.run('complete', env);

        return;
      }

      _.hooks.run('before-highlight', env);

      if (!env.grammar) {
        insertHighlightedCode(_.util.encode(env.code));
        return;
      }

      if (async && _self.Worker) {
        var worker = new Worker(_.filename);

        worker.onmessage = function (evt) {
          insertHighlightedCode(evt.data);
        };

        worker.postMessage(JSON.stringify({
          language: env.language,
          code: env.code,
          immediateClose: true
        }));
      } else {
        insertHighlightedCode(_.highlight(env.code, env.grammar, env.language));
      }
    },
    highlight: function (text, grammar, language) {
      var env = {
        code: text,
        grammar: grammar,
        language: language
      };

      _.hooks.run('before-tokenize', env);

      env.tokens = _.tokenize(env.code, env.grammar);

      _.hooks.run('after-tokenize', env);

      return Token.stringify(_.util.encode(env.tokens), env.language);
    },
    matchGrammar: function (text, strarr, grammar, index, startPos, oneshot, target) {
      for (var token in grammar) {
        if (!grammar.hasOwnProperty(token) || !grammar[token]) {
          continue;
        }

        if (token == target) {
          return;
        }

        var patterns = grammar[token];
        patterns = _.util.type(patterns) === "Array" ? patterns : [patterns];

        for (var j = 0; j < patterns.length; ++j) {
          var pattern = patterns[j],
              inside = pattern.inside,
              lookbehind = !!pattern.lookbehind,
              greedy = !!pattern.greedy,
              lookbehindLength = 0,
              alias = pattern.alias;

          if (greedy && !pattern.pattern.global) {
            // Without the global flag, lastIndex won't work
            var flags = pattern.pattern.toString().match(/[imuy]*$/)[0];
            pattern.pattern = RegExp(pattern.pattern.source, flags + "g");
          }

          pattern = pattern.pattern || pattern; // Don’t cache length as it changes during the loop

          for (var i = index, pos = startPos; i < strarr.length; pos += strarr[i].length, ++i) {
            var str = strarr[i];

            if (strarr.length > text.length) {
              // Something went terribly wrong, ABORT, ABORT!
              return;
            }

            if (str instanceof Token) {
              continue;
            }

            if (greedy && i != strarr.length - 1) {
              pattern.lastIndex = pos;
              var match = pattern.exec(text);

              if (!match) {
                break;
              }

              var from = match.index + (lookbehind ? match[1].length : 0),
                  to = match.index + match[0].length,
                  k = i,
                  p = pos;

              for (var len = strarr.length; k < len && (p < to || !strarr[k].type && !strarr[k - 1].greedy); ++k) {
                p += strarr[k].length; // Move the index i to the element in strarr that is closest to from

                if (from >= p) {
                  ++i;
                  pos = p;
                }
              } // If strarr[i] is a Token, then the match starts inside another Token, which is invalid


              if (strarr[i] instanceof Token) {
                continue;
              } // Number of tokens to delete and replace with the new match


              delNum = k - i;
              str = text.slice(pos, p);
              match.index -= pos;
            } else {
              pattern.lastIndex = 0;
              var match = pattern.exec(str),
                  delNum = 1;
            }

            if (!match) {
              if (oneshot) {
                break;
              }

              continue;
            }

            if (lookbehind) {
              lookbehindLength = match[1] ? match[1].length : 0;
            }

            var from = match.index + lookbehindLength,
                match = match[0].slice(lookbehindLength),
                to = from + match.length,
                before = str.slice(0, from),
                after = str.slice(to);
            var args = [i, delNum];

            if (before) {
              ++i;
              pos += before.length;
              args.push(before);
            }

            var wrapped = new Token(token, inside ? _.tokenize(match, inside) : match, alias, match, greedy);
            args.push(wrapped);

            if (after) {
              args.push(after);
            }

            Array.prototype.splice.apply(strarr, args);
            if (delNum != 1) _.matchGrammar(text, strarr, grammar, i, pos, true, token);
            if (oneshot) break;
          }
        }
      }
    },
    tokenize: function (text, grammar) {
      var strarr = [text];
      var rest = grammar.rest;

      if (rest) {
        for (var token in rest) {
          grammar[token] = rest[token];
        }

        delete grammar.rest;
      }

      _.matchGrammar(text, strarr, grammar, 0, 0, false);

      return strarr;
    },
    hooks: {
      all: {},
      add: function (name, callback) {
        var hooks = _.hooks.all;
        hooks[name] = hooks[name] || [];
        hooks[name].push(callback);
      },
      run: function (name, env) {
        var callbacks = _.hooks.all[name];

        if (!callbacks || !callbacks.length) {
          return;
        }

        for (var i = 0, callback; callback = callbacks[i++];) {
          callback(env);
        }
      }
    },
    Token: Token
  };
  _self.Prism = _;

  function Token(type, content, alias, matchedStr, greedy) {
    this.type = type;
    this.content = content;
    this.alias = alias; // Copy of the full string this token was created from

    this.length = (matchedStr || "").length | 0;
    this.greedy = !!greedy;
  }

  Token.stringify = function (o, language) {
    if (typeof o == 'string') {
      return o;
    }

    if (Array.isArray(o)) {
      return o.map(function (element) {
        return Token.stringify(element, language);
      }).join('');
    }

    var env = {
      type: o.type,
      content: Token.stringify(o.content, language),
      tag: 'span',
      classes: ['token', o.type],
      attributes: {},
      language: language
    };

    if (o.alias) {
      var aliases = Array.isArray(o.alias) ? o.alias : [o.alias];
      Array.prototype.push.apply(env.classes, aliases);
    }

    _.hooks.run('wrap', env);

    var attributes = Object.keys(env.attributes).map(function (name) {
      return name + '="' + (env.attributes[name] || '').replace(/"/g, '&quot;') + '"';
    }).join(' ');
    return '<' + env.tag + ' class="' + env.classes.join(' ') + '"' + (attributes ? ' ' + attributes : '') + '>' + env.content + '</' + env.tag + '>';
  };

  if (!_self.document) {
    if (!_self.addEventListener) {
      // in Node.js
      return _;
    }

    if (!_.disableWorkerMessageHandler) {
      // In worker
      _self.addEventListener('message', function (evt) {
        var message = JSON.parse(evt.data),
            lang = message.language,
            code = message.code,
            immediateClose = message.immediateClose;

        _self.postMessage(_.highlight(code, _.languages[lang], lang));

        if (immediateClose) {
          _self.close();
        }
      }, false);
    }

    return _;
  } //Get current script and highlight


  var script = document.currentScript || [].slice.call(document.getElementsByTagName("script")).pop();

  if (script) {
    _.filename = script.src;

    if (!_.manual && !script.hasAttribute('data-manual')) {
      if (document.readyState !== "loading") {
        if (window.requestAnimationFrame) {
          window.requestAnimationFrame(_.highlightAll);
        } else {
          window.setTimeout(_.highlightAll, 16);
        }
      } else {
        document.addEventListener('DOMContentLoaded', _.highlightAll);
      }
    }
  }

  return _;
}(_self);

if ( module.exports) {
  module.exports = Prism;
} // hack for components to work correctly in node.js


if (typeof commonjsGlobal !== 'undefined') {
  commonjsGlobal.Prism = Prism;
}
/* **********************************************
     Begin prism-markup.js
********************************************** */


Prism.languages.markup = {
  'comment': /<!--[\s\S]*?-->/,
  'prolog': /<\?[\s\S]+?\?>/,
  'doctype': /<!DOCTYPE[\s\S]+?>/i,
  'cdata': /<!\[CDATA\[[\s\S]*?]]>/i,
  'tag': {
    pattern: /<\/?(?!\d)[^\s>\/=$<%]+(?:\s(?:\s*[^\s>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+(?=[\s>]))|(?=[\s/>])))+)?\s*\/?>/i,
    greedy: true,
    inside: {
      'tag': {
        pattern: /^<\/?[^\s>\/]+/i,
        inside: {
          'punctuation': /^<\/?/,
          'namespace': /^[^\s>\/:]+:/
        }
      },
      'attr-value': {
        pattern: /=\s*(?:"[^"]*"|'[^']*'|[^\s'">=]+)/i,
        inside: {
          'punctuation': [/^=/, {
            pattern: /^(\s*)["']|["']$/,
            lookbehind: true
          }]
        }
      },
      'punctuation': /\/?>/,
      'attr-name': {
        pattern: /[^\s>\/]+/,
        inside: {
          'namespace': /^[^\s>\/:]+:/
        }
      }
    }
  },
  'entity': /&#?[\da-z]{1,8};/i
};
Prism.languages.markup['tag'].inside['attr-value'].inside['entity'] = Prism.languages.markup['entity']; // Plugin to make entity title show the real entity, idea by Roman Komarov

Prism.hooks.add('wrap', function (env) {
  if (env.type === 'entity') {
    env.attributes['title'] = env.content.replace(/&amp;/, '&');
  }
});
Object.defineProperty(Prism.languages.markup.tag, 'addInlined', {
  /**
   * Adds an inlined language to markup.
   *
   * An example of an inlined language is CSS with `<style>` tags.
   *
   * @param {string} tagName The name of the tag that contains the inlined language. This name will be treated as
   * case insensitive.
   * @param {string} lang The language key.
   * @example
   * addInlined('style', 'css');
   */
  value: function addInlined(tagName, lang) {
    var includedCdataInside = {};
    includedCdataInside['language-' + lang] = {
      pattern: /(^<!\[CDATA\[)[\s\S]+?(?=\]\]>$)/i,
      lookbehind: true,
      inside: Prism.languages[lang]
    };
    includedCdataInside['cdata'] = /^<!\[CDATA\[|\]\]>$/i;
    var inside = {
      'included-cdata': {
        pattern: /<!\[CDATA\[[\s\S]*?\]\]>/i,
        inside: includedCdataInside
      }
    };
    inside['language-' + lang] = {
      pattern: /[\s\S]+/,
      inside: Prism.languages[lang]
    };
    var def = {};
    def[tagName] = {
      pattern: RegExp(/(<__[\s\S]*?>)(?:<!\[CDATA\[[\s\S]*?\]\]>\s*|[\s\S])*?(?=<\/__>)/.source.replace(/__/g, tagName), 'i'),
      lookbehind: true,
      greedy: true,
      inside: inside
    };
    Prism.languages.insertBefore('markup', 'cdata', def);
  }
});
Prism.languages.xml = Prism.languages.extend('markup', {});
Prism.languages.html = Prism.languages.markup;
Prism.languages.mathml = Prism.languages.markup;
Prism.languages.svg = Prism.languages.markup;
/* **********************************************
     Begin prism-css.js
********************************************** */

(function (Prism) {
  var string = /("|')(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/;
  Prism.languages.css = {
    'comment': /\/\*[\s\S]*?\*\//,
    'atrule': {
      pattern: /@[\w-]+[\s\S]*?(?:;|(?=\s*\{))/,
      inside: {
        'rule': /@[\w-]+/ // See rest below

      }
    },
    'url': {
      pattern: RegExp('url\\((?:' + string.source + '|[^\n\r()]*)\\)', 'i'),
      inside: {
        'function': /^url/i,
        'punctuation': /^\(|\)$/
      }
    },
    'selector': RegExp('[^{}\\s](?:[^{};"\']|' + string.source + ')*?(?=\\s*\\{)'),
    'string': {
      pattern: string,
      greedy: true
    },
    'property': /[-_a-z\xA0-\uFFFF][-\w\xA0-\uFFFF]*(?=\s*:)/i,
    'important': /!important\b/i,
    'function': /[-a-z0-9]+(?=\()/i,
    'punctuation': /[(){};:,]/
  };
  Prism.languages.css['atrule'].inside.rest = Prism.languages.css;
  var markup = Prism.languages.markup;

  if (markup) {
    markup.tag.addInlined('style', 'css');
    Prism.languages.insertBefore('inside', 'attr-value', {
      'style-attr': {
        pattern: /\s*style=("|')(?:\\[\s\S]|(?!\1)[^\\])*\1/i,
        inside: {
          'attr-name': {
            pattern: /^\s*style/i,
            inside: markup.tag.inside
          },
          'punctuation': /^\s*=\s*['"]|['"]\s*$/,
          'attr-value': {
            pattern: /.+/i,
            inside: Prism.languages.css
          }
        },
        alias: 'language-css'
      }
    }, markup.tag);
  }
})(Prism);
/* **********************************************
     Begin prism-clike.js
********************************************** */


Prism.languages.clike = {
  'comment': [{
    pattern: /(^|[^\\])\/\*[\s\S]*?(?:\*\/|$)/,
    lookbehind: true
  }, {
    pattern: /(^|[^\\:])\/\/.*/,
    lookbehind: true,
    greedy: true
  }],
  'string': {
    pattern: /(["'])(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    greedy: true
  },
  'class-name': {
    pattern: /((?:\b(?:class|interface|extends|implements|trait|instanceof|new)\s+)|(?:catch\s+\())[\w.\\]+/i,
    lookbehind: true,
    inside: {
      punctuation: /[.\\]/
    }
  },
  'keyword': /\b(?:if|else|while|do|for|return|in|instanceof|function|new|try|throw|catch|finally|null|break|continue)\b/,
  'boolean': /\b(?:true|false)\b/,
  'function': /\w+(?=\()/,
  'number': /\b0x[\da-f]+\b|(?:\b\d+\.?\d*|\B\.\d+)(?:e[+-]?\d+)?/i,
  'operator': /--?|\+\+?|!=?=?|<=?|>=?|==?=?|&&?|\|\|?|\?|\*|\/|~|\^|%/,
  'punctuation': /[{}[\];(),.:]/
};
/* **********************************************
     Begin prism-javascript.js
********************************************** */

Prism.languages.javascript = Prism.languages.extend('clike', {
  'class-name': [Prism.languages.clike['class-name'], {
    pattern: /(^|[^$\w\xA0-\uFFFF])[_$A-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\.(?:prototype|constructor))/,
    lookbehind: true
  }],
  'keyword': [{
    pattern: /((?:^|})\s*)(?:catch|finally)\b/,
    lookbehind: true
  }, {
    pattern: /(^|[^.])\b(?:as|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
    lookbehind: true
  }],
  'number': /\b(?:(?:0[xX](?:[\dA-Fa-f](?:_[\dA-Fa-f])?)+|0[bB](?:[01](?:_[01])?)+|0[oO](?:[0-7](?:_[0-7])?)+)n?|(?:\d(?:_\d)?)+n|NaN|Infinity)\b|(?:\b(?:\d(?:_\d)?)+\.?(?:\d(?:_\d)?)*|\B\.(?:\d(?:_\d)?)+)(?:[Ee][+-]?(?:\d(?:_\d)?)+)?/,
  // Allow for all non-ASCII characters (See http://stackoverflow.com/a/2008444)
  'function': /#?[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
  'operator': /-[-=]?|\+[+=]?|!=?=?|<<?=?|>>?>?=?|=(?:==?|>)?|&[&=]?|\|[|=]?|\*\*?=?|\/=?|~|\^=?|%=?|\?|\.{3}/
});
Prism.languages.javascript['class-name'][0].pattern = /(\b(?:class|interface|extends|implements|instanceof|new)\s+)[\w.\\]+/;
Prism.languages.insertBefore('javascript', 'keyword', {
  'regex': {
    pattern: /((?:^|[^$\w\xA0-\uFFFF."'\])\s])\s*)\/(\[(?:[^\]\\\r\n]|\\.)*]|\\.|[^/\\\[\r\n])+\/[gimyus]{0,6}(?=\s*($|[\r\n,.;})\]]))/,
    lookbehind: true,
    greedy: true
  },
  // This must be declared before keyword because we use "function" inside the look-forward
  'function-variable': {
    pattern: /#?[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*)\s*=>))/,
    alias: 'function'
  },
  'parameter': [{
    pattern: /(function(?:\s+[_$A-Za-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*)?\s*\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\))/,
    lookbehind: true,
    inside: Prism.languages.javascript
  }, {
    pattern: /[_$a-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*=>)/i,
    inside: Prism.languages.javascript
  }, {
    pattern: /(\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\)\s*=>)/,
    lookbehind: true,
    inside: Prism.languages.javascript
  }, {
    pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:[_$A-Za-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*\s*)\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\)\s*\{)/,
    lookbehind: true,
    inside: Prism.languages.javascript
  }],
  'constant': /\b[A-Z](?:[A-Z_]|\dx?)*\b/
});
Prism.languages.insertBefore('javascript', 'string', {
  'template-string': {
    pattern: /`(?:\\[\s\S]|\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})+}|(?!\${)[^\\`])*`/,
    greedy: true,
    inside: {
      'template-punctuation': {
        pattern: /^`|`$/,
        alias: 'string'
      },
      'interpolation': {
        pattern: /((?:^|[^\\])(?:\\{2})*)\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})+}/,
        lookbehind: true,
        inside: {
          'interpolation-punctuation': {
            pattern: /^\${|}$/,
            alias: 'punctuation'
          },
          rest: Prism.languages.javascript
        }
      },
      'string': /[\s\S]+/
    }
  }
});

if (Prism.languages.markup) {
  Prism.languages.markup.tag.addInlined('script', 'javascript');
}

Prism.languages.js = Prism.languages.javascript;
/* **********************************************
     Begin prism-file-highlight.js
********************************************** */

(function () {
  if (typeof self === 'undefined' || !self.Prism || !self.document || !document.querySelector) {
    return;
  }
  /**
   * @param {Element} [container=document]
   */


  self.Prism.fileHighlight = function (container) {
    container = container || document;
    var Extensions = {
      'js': 'javascript',
      'py': 'python',
      'rb': 'ruby',
      'ps1': 'powershell',
      'psm1': 'powershell',
      'sh': 'bash',
      'bat': 'batch',
      'h': 'c',
      'tex': 'latex'
    };
    Array.prototype.slice.call(container.querySelectorAll('pre[data-src]')).forEach(function (pre) {
      // ignore if already loaded
      if (pre.hasAttribute('data-src-loaded')) {
        return;
      } // load current


      var src = pre.getAttribute('data-src');
      var language,
          parent = pre;
      var lang = /\blang(?:uage)?-([\w-]+)\b/i;

      while (parent && !lang.test(parent.className)) {
        parent = parent.parentNode;
      }

      if (parent) {
        language = (pre.className.match(lang) || [, ''])[1];
      }

      if (!language) {
        var extension = (src.match(/\.(\w+)$/) || [, ''])[1];
        language = Extensions[extension] || extension;
      }

      var code = document.createElement('code');
      code.className = 'language-' + language;
      pre.textContent = '';
      code.textContent = 'Loading…';
      pre.appendChild(code);
      var xhr = new XMLHttpRequest();
      xhr.open('GET', src, true);

      xhr.onreadystatechange = function () {
        if (xhr.readyState == 4) {
          if (xhr.status < 400 && xhr.responseText) {
            code.textContent = xhr.responseText;
            Prism.highlightElement(code); // mark as loaded

            pre.setAttribute('data-src-loaded', '');
          } else if (xhr.status >= 400) {
            code.textContent = '✖ Error ' + xhr.status + ' while fetching file: ' + xhr.statusText;
          } else {
            code.textContent = '✖ Error: File does not exist or is empty';
          }
        }
      };

      xhr.send(null);
    });

    if (Prism.plugins.toolbar) {
      Prism.plugins.toolbar.registerButton('download-file', function (env) {
        var pre = env.element.parentNode;

        if (!pre || !/pre/i.test(pre.nodeName) || !pre.hasAttribute('data-src') || !pre.hasAttribute('data-download-link')) {
          return;
        }

        var src = pre.getAttribute('data-src');
        var a = document.createElement('a');
        a.textContent = pre.getAttribute('data-download-link-label') || 'Download';
        a.setAttribute('download', '');
        a.href = src;
        return a;
      });
    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    // execute inside handler, for dropping Event as argument
    self.Prism.fileHighlight();
  });
})();
});

Prism.languages.apacheconf = {
  'comment': /#.*/,
  'directive-inline': {
    pattern: /(^\s*)\b(?:AcceptFilter|AcceptPathInfo|AccessFileName|Action|Add(?:Alt|AltByEncoding|AltByType|Charset|DefaultCharset|Description|Encoding|Handler|Icon|IconByEncoding|IconByType|InputFilter|Language|ModuleInfo|OutputFilter|OutputFilterByType|Type)|Alias|AliasMatch|Allow(?:CONNECT|EncodedSlashes|Methods|Override|OverrideList)?|Anonymous(?:_LogEmail|_MustGiveEmail|_NoUserID|_VerifyEmail)?|AsyncRequestWorkerFactor|Auth(?:BasicAuthoritative|BasicFake|BasicProvider|BasicUseDigestAlgorithm|DBDUserPWQuery|DBDUserRealmQuery|DBMGroupFile|DBMType|DBMUserFile|Digest(?:Algorithm|Domain|NonceLifetime|Provider|Qop|ShmemSize)|Form(?:Authoritative|Body|DisableNoStore|FakeBasicAuth|Location|LoginRequiredLocation|LoginSuccessLocation|LogoutLocation|Method|Mimetype|Password|Provider|SitePassphrase|Size|Username)|GroupFile|LDAP(?:AuthorizePrefix|BindAuthoritative|BindDN|BindPassword|CharsetConfig|CompareAsUser|CompareDNOnServer|DereferenceAliases|GroupAttribute|GroupAttributeIsDN|InitialBindAsUser|InitialBindPattern|MaxSubGroupDepth|RemoteUserAttribute|RemoteUserIsDN|SearchAsUser|SubGroupAttribute|SubGroupClass|Url)|Merging|Name|Type|UserFile|nCache(?:Context|Enable|ProvideFor|SOCache|Timeout)|nzFcgiCheckAuthnProvider|nzFcgiDefineProvider|zDBDLoginToReferer|zDBDQuery|zDBDRedirectQuery|zDBMType|zSendForbiddenOnFailure)|BalancerGrowth|BalancerInherit|BalancerMember|BalancerPersist|BrowserMatch|BrowserMatchNoCase|BufferSize|BufferedLogs|CGIDScriptTimeout|CGIMapExtension|Cache(?:DefaultExpire|DetailHeader|DirLength|DirLevels|Disable|Enable|File|Header|IgnoreCacheControl|IgnoreHeaders|IgnoreNoLastMod|IgnoreQueryString|IgnoreURLSessionIdentifiers|KeyBaseURL|LastModifiedFactor|Lock|LockMaxAge|LockPath|MaxExpire|MaxFileSize|MinExpire|MinFileSize|NegotiatedDocs|QuickHandler|ReadSize|ReadTime|Root|Socache(?:MaxSize|MaxTime|MinTime|ReadSize|ReadTime)?|StaleOnError|StoreExpired|StoreNoStore|StorePrivate)|CharsetDefault|CharsetOptions|CharsetSourceEnc|CheckCaseOnly|CheckSpelling|ChrootDir|ContentDigest|CookieDomain|CookieExpires|CookieName|CookieStyle|CookieTracking|CoreDumpDirectory|CustomLog|DBDExptime|DBDInitSQL|DBDKeep|DBDMax|DBDMin|DBDParams|DBDPersist|DBDPrepareSQL|DBDriver|DTracePrivileges|Dav|DavDepthInfinity|DavGenericLockDB|DavLockDB|DavMinTimeout|DefaultIcon|DefaultLanguage|DefaultRuntimeDir|DefaultType|Define|Deflate(?:BufferSize|CompressionLevel|FilterNote|InflateLimitRequestBody|InflateRatio(?:Burst|Limit)|MemLevel|WindowSize)|Deny|DirectoryCheckHandler|DirectoryIndex|DirectoryIndexRedirect|DirectorySlash|DocumentRoot|DumpIOInput|DumpIOOutput|EnableExceptionHook|EnableMMAP|EnableSendfile|Error|ErrorDocument|ErrorLog|ErrorLogFormat|Example|ExpiresActive|ExpiresByType|ExpiresDefault|ExtFilterDefine|ExtFilterOptions|ExtendedStatus|FallbackResource|FileETag|FilterChain|FilterDeclare|FilterProtocol|FilterProvider|FilterTrace|ForceLanguagePriority|ForceType|ForensicLog|GprofDir|GracefulShutdownTimeout|Group|Header|HeaderName|Heartbeat(?:Address|Listen|MaxServers|Storage)|HostnameLookups|ISAPI(?:AppendLogToErrors|AppendLogToQuery|CacheFile|FakeAsync|LogNotSupported|ReadAheadBuffer)|IdentityCheck|IdentityCheckTimeout|ImapBase|ImapDefault|ImapMenu|Include|IncludeOptional|Index(?:HeadInsert|Ignore|IgnoreReset|Options|OrderDefault|StyleSheet)|InputSed|KeepAlive|KeepAliveTimeout|KeptBodySize|LDAP(?:CacheEntries|CacheTTL|ConnectionPoolTTL|ConnectionTimeout|LibraryDebug|OpCacheEntries|OpCacheTTL|ReferralHopLimit|Referrals|Retries|RetryDelay|SharedCacheFile|SharedCacheSize|Timeout|TrustedClientCert|TrustedGlobalCert|TrustedMode|VerifyServerCert)|LanguagePriority|Limit(?:InternalRecursion|Request(?:Body|FieldSize|Fields|Line)|XMLRequestBody)|Listen|ListenBackLog|LoadFile|LoadModule|LogFormat|LogLevel|LogMessage|LuaAuthzProvider|LuaCodeCache|Lua(?:Hook(?:AccessChecker|AuthChecker|CheckUserID|Fixups|InsertFilter|Log|MapToStorage|TranslateName|TypeChecker)|Inherit|InputFilter|MapHandler|OutputFilter|PackageCPath|PackagePath|QuickHandler|Root|Scope)|MMapFile|Max(?:ConnectionsPerChild|KeepAliveRequests|MemFree|RangeOverlaps|RangeReversals|Ranges|RequestWorkers|SpareServers|SpareThreads|Threads)|MergeTrailers|MetaDir|MetaFiles|MetaSuffix|MimeMagicFile|MinSpareServers|MinSpareThreads|ModMimeUsePathInfo|ModemStandard|MultiviewsMatch|Mutex|NWSSLTrustedCerts|NWSSLUpgradeable|NameVirtualHost|NoProxy|Options|Order|OutputSed|PassEnv|PidFile|PrivilegesMode|Protocol|ProtocolEcho|Proxy(?:AddHeaders|BadHeader|Block|Domain|ErrorOverride|ExpressDBMFile|ExpressDBMType|ExpressEnable|FtpDirCharset|FtpEscapeWildcards|FtpListOnWildcard|HTML(?:BufSize|CharsetOut|DocType|Enable|Events|Extended|Fixups|Interp|Links|Meta|StripComments|URLMap)|IOBufferSize|MaxForwards|Pass(?:Inherit|InterpolateEnv|Match|Reverse|ReverseCookieDomain|ReverseCookiePath)?|PreserveHost|ReceiveBufferSize|Remote|RemoteMatch|Requests|SCGIInternalRedirect|SCGISendfile|Set|SourceAddress|Status|Timeout|Via)|RLimitCPU|RLimitMEM|RLimitNPROC|ReadmeName|ReceiveBufferSize|Redirect|RedirectMatch|RedirectPermanent|RedirectTemp|ReflectorHeader|RemoteIP(?:Header|InternalProxy|InternalProxyList|ProxiesHeader|TrustedProxy|TrustedProxyList)|RemoveCharset|RemoveEncoding|RemoveHandler|RemoveInputFilter|RemoveLanguage|RemoveOutputFilter|RemoveType|RequestHeader|RequestReadTimeout|Require|Rewrite(?:Base|Cond|Engine|Map|Options|Rule)|SSIETag|SSIEndTag|SSIErrorMsg|SSILastModified|SSILegacyExprParser|SSIStartTag|SSITimeFormat|SSIUndefinedEcho|SSL(?:CACertificateFile|CACertificatePath|CADNRequestFile|CADNRequestPath|CARevocationCheck|CARevocationFile|CARevocationPath|CertificateChainFile|CertificateFile|CertificateKeyFile|CipherSuite|Compression|CryptoDevice|Engine|FIPS|HonorCipherOrder|InsecureRenegotiation|OCSP(?:DefaultResponder|Enable|OverrideResponder|ResponderTimeout|ResponseMaxAge|ResponseTimeSkew|UseRequestNonce)|OpenSSLConfCmd|Options|PassPhraseDialog|Protocol|Proxy(?:CACertificateFile|CACertificatePath|CARevocation(?:Check|File|Path)|CheckPeer(?:CN|Expire|Name)|CipherSuite|Engine|MachineCertificate(?:ChainFile|File|Path)|Protocol|Verify|VerifyDepth)|RandomSeed|RenegBufferSize|Require|RequireSSL|SRPUnknownUserSeed|SRPVerifierFile|Session(?:Cache|CacheTimeout|TicketKeyFile|Tickets)|Stapling(?:Cache|ErrorCacheTimeout|FakeTryLater|ForceURL|ResponderTimeout|ResponseMaxAge|ResponseTimeSkew|ReturnResponderErrors|StandardCacheTimeout)|StrictSNIVHostCheck|UseStapling|UserName|VerifyClient|VerifyDepth)|Satisfy|ScoreBoardFile|Script(?:Alias|AliasMatch|InterpreterSource|Log|LogBuffer|LogLength|Sock)?|SecureListen|SeeRequestTail|SendBufferSize|Server(?:Admin|Alias|Limit|Name|Path|Root|Signature|Tokens)|Session(?:Cookie(?:Name|Name2|Remove)|Crypto(?:Cipher|Driver|Passphrase|PassphraseFile)|DBD(?:CookieName|CookieName2|CookieRemove|DeleteLabel|InsertLabel|PerUser|SelectLabel|UpdateLabel)|Env|Exclude|Header|Include|MaxAge)?|SetEnv|SetEnvIf|SetEnvIfExpr|SetEnvIfNoCase|SetHandler|SetInputFilter|SetOutputFilter|StartServers|StartThreads|Substitute|Suexec|SuexecUserGroup|ThreadLimit|ThreadStackSize|ThreadsPerChild|TimeOut|TraceEnable|TransferLog|TypesConfig|UnDefine|UndefMacro|UnsetEnv|Use|UseCanonicalName|UseCanonicalPhysicalPort|User|UserDir|VHostCGIMode|VHostCGIPrivs|VHostGroup|VHostPrivs|VHostSecure|VHostUser|Virtual(?:DocumentRoot|ScriptAlias)(?:IP)?|WatchdogInterval|XBitHack|xml2EncAlias|xml2EncDefault|xml2StartParse)\b/im,
    lookbehind: true,
    alias: 'property'
  },
  'directive-block': {
    pattern: /<\/?\b(?:Auth[nz]ProviderAlias|Directory|DirectoryMatch|Else|ElseIf|Files|FilesMatch|If|IfDefine|IfModule|IfVersion|Limit|LimitExcept|Location|LocationMatch|Macro|Proxy|Require(?:All|Any|None)|VirtualHost)\b *.*>/i,
    inside: {
      'directive-block': {
        pattern: /^<\/?\w+/,
        inside: {
          'punctuation': /^<\/?/
        },
        alias: 'tag'
      },
      'directive-block-parameter': {
        pattern: /.*[^>]/,
        inside: {
          'punctuation': /:/,
          'string': {
            pattern: /("|').*\1/,
            inside: {
              'variable': /[$%]\{?(?:\w\.?[-+:]?)+\}?/
            }
          }
        },
        alias: 'attr-value'
      },
      'punctuation': />/
    },
    alias: 'tag'
  },
  'directive-flags': {
    pattern: /\[(?:\w,?)+\]/,
    alias: 'keyword'
  },
  'string': {
    pattern: /("|').*\1/,
    inside: {
      'variable': /[$%]\{?(?:\w\.?[-+:]?)+\}?/
    }
  },
  'variable': /[$%]\{?(?:\w\.?[-+:]?)+\}?/,
  'regex': /\^?.*\$|\^.*\$?/
};

Prism.languages.c = Prism.languages.extend('clike', {
  'class-name': {
    pattern: /(\b(?:enum|struct)\s+)\w+/,
    lookbehind: true
  },
  'keyword': /\b(?:_Alignas|_Alignof|_Atomic|_Bool|_Complex|_Generic|_Imaginary|_Noreturn|_Static_assert|_Thread_local|asm|typeof|inline|auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while)\b/,
  'operator': />>=?|<<=?|->|([-+&|:])\1|[?:~]|[-+*/%&|^!=<>]=?/,
  'number': /(?:\b0x(?:[\da-f]+\.?[\da-f]*|\.[\da-f]+)(?:p[+-]?\d+)?|(?:\b\d+\.?\d*|\B\.\d+)(?:e[+-]?\d+)?)[ful]*/i
});
Prism.languages.insertBefore('c', 'string', {
  'macro': {
    // allow for multiline macro definitions
    // spaces after the # character compile fine with gcc
    pattern: /(^\s*)#\s*[a-z]+(?:[^\r\n\\]|\\(?:\r\n|[\s\S]))*/im,
    lookbehind: true,
    alias: 'property',
    inside: {
      // highlight the path of the include statement as a string
      'string': {
        pattern: /(#\s*include\s*)(?:<.+?>|("|')(?:\\?.)+?\2)/,
        lookbehind: true
      },
      // highlight macro directives as keywords
      'directive': {
        pattern: /(#\s*)\b(?:define|defined|elif|else|endif|error|ifdef|ifndef|if|import|include|line|pragma|undef|using)\b/,
        lookbehind: true,
        alias: 'keyword'
      }
    }
  },
  // highlight predefined macros as constants
  'constant': /\b(?:__FILE__|__LINE__|__DATE__|__TIME__|__TIMESTAMP__|__func__|EOF|NULL|SEEK_CUR|SEEK_END|SEEK_SET|stdin|stdout|stderr)\b/
});
delete Prism.languages.c['boolean'];

Prism.languages.cpp = Prism.languages.extend('c', {
  'class-name': {
    pattern: /(\b(?:class|enum|struct)\s+)\w+/,
    lookbehind: true
  },
  'keyword': /\b(?:alignas|alignof|asm|auto|bool|break|case|catch|char|char16_t|char32_t|class|compl|const|constexpr|const_cast|continue|decltype|default|delete|do|double|dynamic_cast|else|enum|explicit|export|extern|float|for|friend|goto|if|inline|int|int8_t|int16_t|int32_t|int64_t|uint8_t|uint16_t|uint32_t|uint64_t|long|mutable|namespace|new|noexcept|nullptr|operator|private|protected|public|register|reinterpret_cast|return|short|signed|sizeof|static|static_assert|static_cast|struct|switch|template|this|thread_local|throw|try|typedef|typeid|typename|union|unsigned|using|virtual|void|volatile|wchar_t|while)\b/,
  'number': {
    pattern: /(?:\b0b[01']+|\b0x(?:[\da-f']+\.?[\da-f']*|\.[\da-f']+)(?:p[+-]?[\d']+)?|(?:\b[\d']+\.?[\d']*|\B\.[\d']+)(?:e[+-]?[\d']+)?)[ful]*/i,
    greedy: true
  },
  'operator': />>=?|<<=?|->|([-+&|:])\1|[?:~]|[-+*/%&|^!=<>]=?|\b(?:and|and_eq|bitand|bitor|not|not_eq|or|or_eq|xor|xor_eq)\b/,
  'boolean': /\b(?:true|false)\b/
});
Prism.languages.insertBefore('cpp', 'string', {
  'raw-string': {
    pattern: /R"([^()\\ ]{0,16})\([\s\S]*?\)\1"/,
    alias: 'string',
    greedy: true
  }
});

Prism.languages.csharp = Prism.languages.extend('clike', {
  'keyword': /\b(?:abstract|add|alias|as|ascending|async|await|base|bool|break|byte|case|catch|char|checked|class|const|continue|decimal|default|delegate|descending|do|double|dynamic|else|enum|event|explicit|extern|false|finally|fixed|float|for|foreach|from|get|global|goto|group|if|implicit|in|int|interface|internal|into|is|join|let|lock|long|namespace|new|null|object|operator|orderby|out|override|params|partial|private|protected|public|readonly|ref|remove|return|sbyte|sealed|select|set|short|sizeof|stackalloc|static|string|struct|switch|this|throw|true|try|typeof|uint|ulong|unchecked|unsafe|ushort|using|value|var|virtual|void|volatile|where|while|yield)\b/,
  'string': [{
    pattern: /@("|')(?:\1\1|\\[\s\S]|(?!\1)[^\\])*\1/,
    greedy: true
  }, {
    pattern: /("|')(?:\\.|(?!\1)[^\\\r\n])*?\1/,
    greedy: true
  }],
  'class-name': [{
    // (Foo bar, Bar baz)
    pattern: /\b[A-Z]\w*(?:\.\w+)*\b(?=\s+\w+)/,
    inside: {
      punctuation: /\./
    }
  }, {
    // [Foo]
    pattern: /(\[)[A-Z]\w*(?:\.\w+)*\b/,
    lookbehind: true,
    inside: {
      punctuation: /\./
    }
  }, {
    // class Foo : Bar
    pattern: /(\b(?:class|interface)\s+[A-Z]\w*(?:\.\w+)*\s*:\s*)[A-Z]\w*(?:\.\w+)*\b/,
    lookbehind: true,
    inside: {
      punctuation: /\./
    }
  }, {
    // class Foo
    pattern: /((?:\b(?:class|interface|new)\s+)|(?:catch\s+\())[A-Z]\w*(?:\.\w+)*\b/,
    lookbehind: true,
    inside: {
      punctuation: /\./
    }
  }],
  'number': /\b0x[\da-f]+\b|(?:\b\d+\.?\d*|\B\.\d+)f?/i,
  'operator': />>=?|<<=?|[-=]>|([-+&|?])\1|~|[-+*/%&|^!=<>]=?/,
  'punctuation': /\?\.?|::|[{}[\];(),.:]/
});
Prism.languages.insertBefore('csharp', 'class-name', {
  'generic-method': {
    pattern: /\w+\s*<[^>\r\n]+?>\s*(?=\()/,
    inside: {
      function: /^\w+/,
      'class-name': {
        pattern: /\b[A-Z]\w*(?:\.\w+)*\b/,
        inside: {
          punctuation: /\./
        }
      },
      keyword: Prism.languages.csharp.keyword,
      punctuation: /[<>(),.:]/
    }
  },
  'preprocessor': {
    pattern: /(^\s*)#.*/m,
    lookbehind: true,
    alias: 'property',
    inside: {
      // highlight preprocessor directives as keywords
      'directive': {
        pattern: /(\s*#)\b(?:define|elif|else|endif|endregion|error|if|line|pragma|region|undef|warning)\b/,
        lookbehind: true,
        alias: 'keyword'
      }
    }
  }
});
Prism.languages.dotnet = Prism.languages.cs = Prism.languages.csharp;

(function (Prism) {
  // Ignore comments starting with { to privilege string interpolation highlighting
  var comment = /#(?!\{).+/,
      interpolation = {
    pattern: /#\{[^}]+\}/,
    alias: 'variable'
  };
  Prism.languages.coffeescript = Prism.languages.extend('javascript', {
    'comment': comment,
    'string': [// Strings are multiline
    {
      pattern: /'(?:\\[\s\S]|[^\\'])*'/,
      greedy: true
    }, {
      // Strings are multiline
      pattern: /"(?:\\[\s\S]|[^\\"])*"/,
      greedy: true,
      inside: {
        'interpolation': interpolation
      }
    }],
    'keyword': /\b(?:and|break|by|catch|class|continue|debugger|delete|do|each|else|extend|extends|false|finally|for|if|in|instanceof|is|isnt|let|loop|namespace|new|no|not|null|of|off|on|or|own|return|super|switch|then|this|throw|true|try|typeof|undefined|unless|until|when|while|window|with|yes|yield)\b/,
    'class-member': {
      pattern: /@(?!\d)\w+/,
      alias: 'variable'
    }
  });
  Prism.languages.insertBefore('coffeescript', 'comment', {
    'multiline-comment': {
      pattern: /###[\s\S]+?###/,
      alias: 'comment'
    },
    // Block regexp can contain comments and interpolation
    'block-regex': {
      pattern: /\/{3}[\s\S]*?\/{3}/,
      alias: 'regex',
      inside: {
        'comment': comment,
        'interpolation': interpolation
      }
    }
  });
  Prism.languages.insertBefore('coffeescript', 'string', {
    'inline-javascript': {
      pattern: /`(?:\\[\s\S]|[^\\`])*`/,
      inside: {
        'delimiter': {
          pattern: /^`|`$/,
          alias: 'punctuation'
        },
        rest: Prism.languages.javascript
      }
    },
    // Block strings
    'multiline-string': [{
      pattern: /'''[\s\S]*?'''/,
      greedy: true,
      alias: 'string'
    }, {
      pattern: /"""[\s\S]*?"""/,
      greedy: true,
      alias: 'string',
      inside: {
        interpolation: interpolation
      }
    }]
  });
  Prism.languages.insertBefore('coffeescript', 'keyword', {
    // Object property
    'property': /(?!\d)\w+(?=\s*:(?!:))/
  });
  delete Prism.languages.coffeescript['template-string'];
  Prism.languages.coffee = Prism.languages.coffeescript;
})(Prism);

(function (Prism) {
  var string = /("|')(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/;
  Prism.languages.css = {
    'comment': /\/\*[\s\S]*?\*\//,
    'atrule': {
      pattern: /@[\w-]+[\s\S]*?(?:;|(?=\s*\{))/,
      inside: {
        'rule': /@[\w-]+/ // See rest below

      }
    },
    'url': {
      pattern: RegExp('url\\((?:' + string.source + '|[^\n\r()]*)\\)', 'i'),
      inside: {
        'function': /^url/i,
        'punctuation': /^\(|\)$/
      }
    },
    'selector': RegExp('[^{}\\s](?:[^{};"\']|' + string.source + ')*?(?=\\s*\\{)'),
    'string': {
      pattern: string,
      greedy: true
    },
    'property': /[-_a-z\xA0-\uFFFF][-\w\xA0-\uFFFF]*(?=\s*:)/i,
    'important': /!important\b/i,
    'function': /[-a-z0-9]+(?=\()/i,
    'punctuation': /[(){};:,]/
  };
  Prism.languages.css['atrule'].inside.rest = Prism.languages.css;
  var markup = Prism.languages.markup;

  if (markup) {
    markup.tag.addInlined('style', 'css');
    Prism.languages.insertBefore('inside', 'attr-value', {
      'style-attr': {
        pattern: /\s*style=("|')(?:\\[\s\S]|(?!\1)[^\\])*\1/i,
        inside: {
          'attr-name': {
            pattern: /^\s*style/i,
            inside: markup.tag.inside
          },
          'punctuation': /^\s*=\s*['"]|['"]\s*$/,
          'attr-value': {
            pattern: /.+/i,
            inside: Prism.languages.css
          }
        },
        alias: 'language-css'
      }
    }, markup.tag);
  }
})(Prism);

Prism.languages.go = Prism.languages.extend('clike', {
  'keyword': /\b(?:break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go(?:to)?|if|import|interface|map|package|range|return|select|struct|switch|type|var)\b/,
  'builtin': /\b(?:bool|byte|complex(?:64|128)|error|float(?:32|64)|rune|string|u?int(?:8|16|32|64)?|uintptr|append|cap|close|complex|copy|delete|imag|len|make|new|panic|print(?:ln)?|real|recover)\b/,
  'boolean': /\b(?:_|iota|nil|true|false)\b/,
  'operator': /[*\/%^!=]=?|\+[=+]?|-[=-]?|\|[=|]?|&(?:=|&|\^=?)?|>(?:>=?|=)?|<(?:<=?|=|-)?|:=|\.\.\./,
  'number': /(?:\b0x[a-f\d]+|(?:\b\d+\.?\d*|\B\.\d+)(?:e[-+]?\d+)?)i?/i,
  'string': {
    pattern: /(["'`])(\\[\s\S]|(?!\1)[^\\])*\1/,
    greedy: true
  }
});
delete Prism.languages.go['class-name'];

(function (Prism) {
  var keywords = /\b(?:abstract|continue|for|new|switch|assert|default|goto|package|synchronized|boolean|do|if|private|this|break|double|implements|protected|throw|byte|else|import|public|throws|case|enum|instanceof|return|transient|catch|extends|int|short|try|char|final|interface|static|void|class|finally|long|strictfp|volatile|const|float|native|super|while|var|null|exports|module|open|opens|provides|requires|to|transitive|uses|with)\b/; // based on the java naming conventions

  var className = /\b[A-Z](?:\w*[a-z]\w*)?\b/;
  Prism.languages.java = Prism.languages.extend('clike', {
    'class-name': [className, // variables and parameters
    // this to support class names (or generic parameters) which do not contain a lower case letter (also works for methods)
    /\b[A-Z]\w*(?=\s+\w+\s*[;,=())])/],
    'keyword': keywords,
    'function': [Prism.languages.clike.function, {
      pattern: /(\:\:)[a-z_]\w*/,
      lookbehind: true
    }],
    'number': /\b0b[01][01_]*L?\b|\b0x[\da-f_]*\.?[\da-f_p+-]+\b|(?:\b\d[\d_]*\.?[\d_]*|\B\.\d[\d_]*)(?:e[+-]?\d[\d_]*)?[dfl]?/i,
    'operator': {
      pattern: /(^|[^.])(?:<<=?|>>>?=?|->|([-+&|])\2|[?:~]|[-+*/%&|^!=<>]=?)/m,
      lookbehind: true
    }
  });
  Prism.languages.insertBefore('java', 'class-name', {
    'annotation': {
      alias: 'punctuation',
      pattern: /(^|[^.])@\w+/,
      lookbehind: true
    },
    'namespace': {
      pattern: /(\b(?:exports|import(?:\s+static)?|module|open|opens|package|provides|requires|to|transitive|uses|with)\s+)[a-z]\w*(\.[a-z]\w*)+/,
      lookbehind: true,
      inside: {
        'punctuation': /\./
      }
    },
    'generics': {
      pattern: /<(?:[\w\s,.&?]|<(?:[\w\s,.&?]|<(?:[\w\s,.&?]|<[\w\s,.&?]*>)*>)*>)*>/,
      inside: {
        'class-name': className,
        'keyword': keywords,
        'punctuation': /[<>(),.:]/,
        'operator': /[?&|]/
      }
    }
  });
})(Prism);

Prism.languages.javascript = Prism.languages.extend('clike', {
  'class-name': [Prism.languages.clike['class-name'], {
    pattern: /(^|[^$\w\xA0-\uFFFF])[_$A-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\.(?:prototype|constructor))/,
    lookbehind: true
  }],
  'keyword': [{
    pattern: /((?:^|})\s*)(?:catch|finally)\b/,
    lookbehind: true
  }, {
    pattern: /(^|[^.])\b(?:as|async(?=\s*(?:function\b|\(|[$\w\xA0-\uFFFF]|$))|await|break|case|class|const|continue|debugger|default|delete|do|else|enum|export|extends|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)\b/,
    lookbehind: true
  }],
  'number': /\b(?:(?:0[xX](?:[\dA-Fa-f](?:_[\dA-Fa-f])?)+|0[bB](?:[01](?:_[01])?)+|0[oO](?:[0-7](?:_[0-7])?)+)n?|(?:\d(?:_\d)?)+n|NaN|Infinity)\b|(?:\b(?:\d(?:_\d)?)+\.?(?:\d(?:_\d)?)*|\B\.(?:\d(?:_\d)?)+)(?:[Ee][+-]?(?:\d(?:_\d)?)+)?/,
  // Allow for all non-ASCII characters (See http://stackoverflow.com/a/2008444)
  'function': /#?[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*(?:\.\s*(?:apply|bind|call)\s*)?\()/,
  'operator': /-[-=]?|\+[+=]?|!=?=?|<<?=?|>>?>?=?|=(?:==?|>)?|&[&=]?|\|[|=]?|\*\*?=?|\/=?|~|\^=?|%=?|\?|\.{3}/
});
Prism.languages.javascript['class-name'][0].pattern = /(\b(?:class|interface|extends|implements|instanceof|new)\s+)[\w.\\]+/;
Prism.languages.insertBefore('javascript', 'keyword', {
  'regex': {
    pattern: /((?:^|[^$\w\xA0-\uFFFF."'\])\s])\s*)\/(\[(?:[^\]\\\r\n]|\\.)*]|\\.|[^/\\\[\r\n])+\/[gimyus]{0,6}(?=\s*($|[\r\n,.;})\]]))/,
    lookbehind: true,
    greedy: true
  },
  // This must be declared before keyword because we use "function" inside the look-forward
  'function-variable': {
    pattern: /#?[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*[=:]\s*(?:async\s*)?(?:\bfunction\b|(?:\((?:[^()]|\([^()]*\))*\)|[_$a-zA-Z\xA0-\uFFFF][$\w\xA0-\uFFFF]*)\s*=>))/,
    alias: 'function'
  },
  'parameter': [{
    pattern: /(function(?:\s+[_$A-Za-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*)?\s*\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\))/,
    lookbehind: true,
    inside: Prism.languages.javascript
  }, {
    pattern: /[_$a-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*(?=\s*=>)/i,
    inside: Prism.languages.javascript
  }, {
    pattern: /(\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\)\s*=>)/,
    lookbehind: true,
    inside: Prism.languages.javascript
  }, {
    pattern: /((?:\b|\s|^)(?!(?:as|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|package|private|protected|public|return|set|static|super|switch|this|throw|try|typeof|undefined|var|void|while|with|yield)(?![$\w\xA0-\uFFFF]))(?:[_$A-Za-z\xA0-\uFFFF][$\w\xA0-\uFFFF]*\s*)\(\s*)(?!\s)(?:[^()]|\([^()]*\))+?(?=\s*\)\s*\{)/,
    lookbehind: true,
    inside: Prism.languages.javascript
  }],
  'constant': /\b[A-Z](?:[A-Z_]|\dx?)*\b/
});
Prism.languages.insertBefore('javascript', 'string', {
  'template-string': {
    pattern: /`(?:\\[\s\S]|\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})+}|(?!\${)[^\\`])*`/,
    greedy: true,
    inside: {
      'template-punctuation': {
        pattern: /^`|`$/,
        alias: 'string'
      },
      'interpolation': {
        pattern: /((?:^|[^\\])(?:\\{2})*)\${(?:[^{}]|{(?:[^{}]|{[^}]*})*})+}/,
        lookbehind: true,
        inside: {
          'interpolation-punctuation': {
            pattern: /^\${|}$/,
            alias: 'punctuation'
          },
          rest: Prism.languages.javascript
        }
      },
      'string': /[\s\S]+/
    }
  }
});

if (Prism.languages.markup) {
  Prism.languages.markup.tag.addInlined('script', 'javascript');
}

Prism.languages.js = Prism.languages.javascript;

Prism.languages.json = {
  'property': {
    pattern: /"(?:\\.|[^\\"\r\n])*"(?=\s*:)/,
    greedy: true
  },
  'string': {
    pattern: /"(?:\\.|[^\\"\r\n])*"(?!\s*:)/,
    greedy: true
  },
  'comment': /\/\/.*|\/\*[\s\S]*?(?:\*\/|$)/,
  'number': /-?\d+\.?\d*(e[+-]?\d+)?/i,
  'punctuation': /[{}[\],]/,
  'operator': /:/,
  'boolean': /\b(?:true|false)\b/,
  'null': {
    pattern: /\bnull\b/,
    alias: 'keyword'
  }
};

Prism.languages.lua = {
  'comment': /^#!.+|--(?:\[(=*)\[[\s\S]*?\]\1\]|.*)/m,
  // \z may be used to skip the following space
  'string': {
    pattern: /(["'])(?:(?!\1)[^\\\r\n]|\\z(?:\r\n|\s)|\\(?:\r\n|[\s\S]))*\1|\[(=*)\[[\s\S]*?\]\2\]/,
    greedy: true
  },
  'number': /\b0x[a-f\d]+\.?[a-f\d]*(?:p[+-]?\d+)?\b|\b\d+(?:\.\B|\.?\d*(?:e[+-]?\d+)?\b)|\B\.\d+(?:e[+-]?\d+)?\b/i,
  'keyword': /\b(?:and|break|do|else|elseif|end|false|for|function|goto|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b/,
  'function': /(?!\d)\w+(?=\s*(?:[({]))/,
  'operator': [/[-+*%^&|#]|\/\/?|<[<=]?|>[>=]?|[=~]=?/, {
    // Match ".." but don't break "..."
    pattern: /(^|[^.])\.\.(?!\.)/,
    lookbehind: true
  }],
  'punctuation': /[\[\](){},;]|\.+|:+/
};

Prism.languages.matlab = {
  'comment': [/%\{[\s\S]*?\}%/, /%.+/],
  'string': {
    pattern: /\B'(?:''|[^'\r\n])*'/,
    greedy: true
  },
  // FIXME We could handle imaginary numbers as a whole
  'number': /(?:\b\d+\.?\d*|\B\.\d+)(?:[eE][+-]?\d+)?(?:[ij])?|\b[ij]\b/,
  'keyword': /\b(?:break|case|catch|continue|else|elseif|end|for|function|if|inf|NaN|otherwise|parfor|pause|pi|return|switch|try|while)\b/,
  'function': /(?!\d)\w+(?=\s*\()/,
  'operator': /\.?[*^\/\\']|[+\-:@]|[<>=~]=?|&&?|\|\|?/,
  'punctuation': /\.{3}|[.,;\[\](){}!]/
};

Prism.languages.objectivec = Prism.languages.extend('c', {
  'keyword': /\b(?:asm|typeof|inline|auto|break|case|char|const|continue|default|do|double|else|enum|extern|float|for|goto|if|int|long|register|return|short|signed|sizeof|static|struct|switch|typedef|union|unsigned|void|volatile|while|in|self|super)\b|(?:@interface|@end|@implementation|@protocol|@class|@public|@protected|@private|@property|@try|@catch|@finally|@throw|@synthesize|@dynamic|@selector)\b/,
  'string': /("|')(?:\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1|@"(?:\\(?:\r\n|[\s\S])|[^"\\\r\n])*"/,
  'operator': /-[->]?|\+\+?|!=?|<<?=?|>>?=?|==?|&&?|\|\|?|[~^%?*\/@]/
});
delete Prism.languages.objectivec['class-name'];

Prism.languages.perl = {
  'comment': [{
    // POD
    pattern: /(^\s*)=\w+[\s\S]*?=cut.*/m,
    lookbehind: true
  }, {
    pattern: /(^|[^\\$])#.*/,
    lookbehind: true
  }],
  // TODO Could be nice to handle Heredoc too.
  'string': [// q/.../
  {
    pattern: /\b(?:q|qq|qx|qw)\s*([^a-zA-Z0-9\s{(\[<])(?:(?!\1)[^\\]|\\[\s\S])*\1/,
    greedy: true
  }, // q a...a
  {
    pattern: /\b(?:q|qq|qx|qw)\s+([a-zA-Z0-9])(?:(?!\1)[^\\]|\\[\s\S])*\1/,
    greedy: true
  }, // q(...)
  {
    pattern: /\b(?:q|qq|qx|qw)\s*\((?:[^()\\]|\\[\s\S])*\)/,
    greedy: true
  }, // q{...}
  {
    pattern: /\b(?:q|qq|qx|qw)\s*\{(?:[^{}\\]|\\[\s\S])*\}/,
    greedy: true
  }, // q[...]
  {
    pattern: /\b(?:q|qq|qx|qw)\s*\[(?:[^[\]\\]|\\[\s\S])*\]/,
    greedy: true
  }, // q<...>
  {
    pattern: /\b(?:q|qq|qx|qw)\s*<(?:[^<>\\]|\\[\s\S])*>/,
    greedy: true
  }, // "...", `...`
  {
    pattern: /("|`)(?:(?!\1)[^\\]|\\[\s\S])*\1/,
    greedy: true
  }, // '...'
  // FIXME Multi-line single-quoted strings are not supported as they would break variables containing '
  {
    pattern: /'(?:[^'\\\r\n]|\\.)*'/,
    greedy: true
  }],
  'regex': [// m/.../
  {
    pattern: /\b(?:m|qr)\s*([^a-zA-Z0-9\s{(\[<])(?:(?!\1)[^\\]|\\[\s\S])*\1[msixpodualngc]*/,
    greedy: true
  }, // m a...a
  {
    pattern: /\b(?:m|qr)\s+([a-zA-Z0-9])(?:(?!\1)[^\\]|\\[\s\S])*\1[msixpodualngc]*/,
    greedy: true
  }, // m(...)
  {
    pattern: /\b(?:m|qr)\s*\((?:[^()\\]|\\[\s\S])*\)[msixpodualngc]*/,
    greedy: true
  }, // m{...}
  {
    pattern: /\b(?:m|qr)\s*\{(?:[^{}\\]|\\[\s\S])*\}[msixpodualngc]*/,
    greedy: true
  }, // m[...]
  {
    pattern: /\b(?:m|qr)\s*\[(?:[^[\]\\]|\\[\s\S])*\][msixpodualngc]*/,
    greedy: true
  }, // m<...>
  {
    pattern: /\b(?:m|qr)\s*<(?:[^<>\\]|\\[\s\S])*>[msixpodualngc]*/,
    greedy: true
  }, // The lookbehinds prevent -s from breaking
  // FIXME We don't handle change of separator like s(...)[...]
  // s/.../.../
  {
    pattern: /(^|[^-]\b)(?:s|tr|y)\s*([^a-zA-Z0-9\s{(\[<])(?:(?!\2)[^\\]|\\[\s\S])*\2(?:(?!\2)[^\\]|\\[\s\S])*\2[msixpodualngcer]*/,
    lookbehind: true,
    greedy: true
  }, // s a...a...a
  {
    pattern: /(^|[^-]\b)(?:s|tr|y)\s+([a-zA-Z0-9])(?:(?!\2)[^\\]|\\[\s\S])*\2(?:(?!\2)[^\\]|\\[\s\S])*\2[msixpodualngcer]*/,
    lookbehind: true,
    greedy: true
  }, // s(...)(...)
  {
    pattern: /(^|[^-]\b)(?:s|tr|y)\s*\((?:[^()\\]|\\[\s\S])*\)\s*\((?:[^()\\]|\\[\s\S])*\)[msixpodualngcer]*/,
    lookbehind: true,
    greedy: true
  }, // s{...}{...}
  {
    pattern: /(^|[^-]\b)(?:s|tr|y)\s*\{(?:[^{}\\]|\\[\s\S])*\}\s*\{(?:[^{}\\]|\\[\s\S])*\}[msixpodualngcer]*/,
    lookbehind: true,
    greedy: true
  }, // s[...][...]
  {
    pattern: /(^|[^-]\b)(?:s|tr|y)\s*\[(?:[^[\]\\]|\\[\s\S])*\]\s*\[(?:[^[\]\\]|\\[\s\S])*\][msixpodualngcer]*/,
    lookbehind: true,
    greedy: true
  }, // s<...><...>
  {
    pattern: /(^|[^-]\b)(?:s|tr|y)\s*<(?:[^<>\\]|\\[\s\S])*>\s*<(?:[^<>\\]|\\[\s\S])*>[msixpodualngcer]*/,
    lookbehind: true,
    greedy: true
  }, // /.../
  // The look-ahead tries to prevent two divisions on
  // the same line from being highlighted as regex.
  // This does not support multi-line regex.
  {
    pattern: /\/(?:[^\/\\\r\n]|\\.)*\/[msixpodualngc]*(?=\s*(?:$|[\r\n,.;})&|\-+*~<>!?^]|(lt|gt|le|ge|eq|ne|cmp|not|and|or|xor|x)\b))/,
    greedy: true
  }],
  // FIXME Not sure about the handling of ::, ', and #
  'variable': [// ${^POSTMATCH}
  /[&*$@%]\{\^[A-Z]+\}/, // $^V
  /[&*$@%]\^[A-Z_]/, // ${...}
  /[&*$@%]#?(?=\{)/, // $foo
  /[&*$@%]#?(?:(?:::)*'?(?!\d)[\w$]+)+(?:::)*/i, // $1
  /[&*$@%]\d+/, // $_, @_, %!
  // The negative lookahead prevents from breaking the %= operator
  /(?!%=)[$@%][!"#$%&'()*+,\-.\/:;<=>?@[\\\]^_`{|}~]/],
  'filehandle': {
    // <>, <FOO>, _
    pattern: /<(?![<=])\S*>|\b_\b/,
    alias: 'symbol'
  },
  'vstring': {
    // v1.2, 1.2.3
    pattern: /v\d+(?:\.\d+)*|\d+(?:\.\d+){2,}/,
    alias: 'string'
  },
  'function': {
    pattern: /sub [a-z0-9_]+/i,
    inside: {
      keyword: /sub/
    }
  },
  'keyword': /\b(?:any|break|continue|default|delete|die|do|else|elsif|eval|for|foreach|given|goto|if|last|local|my|next|our|package|print|redo|require|return|say|state|sub|switch|undef|unless|until|use|when|while)\b/,
  'number': /\b(?:0x[\dA-Fa-f](?:_?[\dA-Fa-f])*|0b[01](?:_?[01])*|(?:\d(?:_?\d)*)?\.?\d(?:_?\d)*(?:[Ee][+-]?\d+)?)\b/,
  'operator': /-[rwxoRWXOezsfdlpSbctugkTBMAC]\b|\+[+=]?|-[-=>]?|\*\*?=?|\/\/?=?|=[=~>]?|~[~=]?|\|\|?=?|&&?=?|<(?:=>?|<=?)?|>>?=?|![~=]?|[%^]=?|\.(?:=|\.\.?)?|[\\?]|\bx(?:=|\b)|\b(?:lt|gt|le|ge|eq|ne|cmp|not|and|or|xor)\b/,
  'punctuation': /[{}[\];(),:]/
};

/**
 * Original by Aaron Harun: http://aahacreative.com/2012/07/31/php-syntax-highlighting-prism/
 * Modified by Miles Johnson: http://milesj.me
 *
 * Supports the following:
 * 		- Extends clike syntax
 * 		- Support for PHP 5.3+ (namespaces, traits, generators, etc)
 * 		- Smarter constant and function matching
 *
 * Adds the following new token classes:
 * 		constant, delimiter, variable, function, package
 */
(function (Prism) {
  Prism.languages.php = Prism.languages.extend('clike', {
    'keyword': /\b(?:__halt_compiler|abstract|and|array|as|break|callable|case|catch|class|clone|const|continue|declare|default|die|do|echo|else|elseif|empty|enddeclare|endfor|endforeach|endif|endswitch|endwhile|eval|exit|extends|final|finally|for|foreach|function|global|goto|if|implements|include|include_once|instanceof|insteadof|interface|isset|list|namespace|new|or|parent|print|private|protected|public|require|require_once|return|static|switch|throw|trait|try|unset|use|var|while|xor|yield)\b/i,
    'boolean': {
      pattern: /\b(?:false|true)\b/i,
      alias: 'constant'
    },
    'constant': [/\b[A-Z_][A-Z0-9_]*\b/, /\b(?:null)\b/i],
    'comment': {
      pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|\/\/.*)/,
      lookbehind: true
    }
  });
  Prism.languages.insertBefore('php', 'string', {
    'shell-comment': {
      pattern: /(^|[^\\])#.*/,
      lookbehind: true,
      alias: 'comment'
    }
  });
  Prism.languages.insertBefore('php', 'comment', {
    'delimiter': {
      pattern: /\?>$|^<\?(?:php(?=\s)|=)?/i,
      alias: 'important'
    }
  });
  Prism.languages.insertBefore('php', 'keyword', {
    'variable': /\$+(?:\w+\b|(?={))/i,
    'package': {
      pattern: /(\\|namespace\s+|use\s+)[\w\\]+/,
      lookbehind: true,
      inside: {
        punctuation: /\\/
      }
    }
  }); // Must be defined after the function pattern

  Prism.languages.insertBefore('php', 'operator', {
    'property': {
      pattern: /(->)[\w]+/,
      lookbehind: true
    }
  });
  var string_interpolation = {
    pattern: /{\$(?:{(?:{[^{}]+}|[^{}]+)}|[^{}])+}|(^|[^\\{])\$+(?:\w+(?:\[.+?]|->\w+)*)/,
    lookbehind: true,
    inside: {
      rest: Prism.languages.php
    }
  };
  Prism.languages.insertBefore('php', 'string', {
    'nowdoc-string': {
      pattern: /<<<'([^']+)'(?:\r\n?|\n)(?:.*(?:\r\n?|\n))*?\1;/,
      greedy: true,
      alias: 'string',
      inside: {
        'delimiter': {
          pattern: /^<<<'[^']+'|[a-z_]\w*;$/i,
          alias: 'symbol',
          inside: {
            'punctuation': /^<<<'?|[';]$/
          }
        }
      }
    },
    'heredoc-string': {
      pattern: /<<<(?:"([^"]+)"(?:\r\n?|\n)(?:.*(?:\r\n?|\n))*?\1;|([a-z_]\w*)(?:\r\n?|\n)(?:.*(?:\r\n?|\n))*?\2;)/i,
      greedy: true,
      alias: 'string',
      inside: {
        'delimiter': {
          pattern: /^<<<(?:"[^"]+"|[a-z_]\w*)|[a-z_]\w*;$/i,
          alias: 'symbol',
          inside: {
            'punctuation': /^<<<"?|[";]$/
          }
        },
        'interpolation': string_interpolation // See below

      }
    },
    'single-quoted-string': {
      pattern: /'(?:\\[\s\S]|[^\\'])*'/,
      greedy: true,
      alias: 'string'
    },
    'double-quoted-string': {
      pattern: /"(?:\\[\s\S]|[^\\"])*"/,
      greedy: true,
      alias: 'string',
      inside: {
        'interpolation': string_interpolation // See below

      }
    }
  }); // The different types of PHP strings "replace" the C-like standard string

  delete Prism.languages.php['string'];
  Prism.hooks.add('before-tokenize', function (env) {
    if (!/<\?/.test(env.code)) {
      return;
    }

    var phpPattern = /<\?(?:[^"'/#]|\/(?![*/])|("|')(?:\\[\s\S]|(?!\1)[^\\])*\1|(?:\/\/|#)(?:[^?\n\r]|\?(?!>))*|\/\*[\s\S]*?(?:\*\/|$))*?(?:\?>|$)/ig;
    Prism.languages['markup-templating'].buildPlaceholders(env, 'php', phpPattern);
  });
  Prism.hooks.add('after-tokenize', function (env) {
    Prism.languages['markup-templating'].tokenizePlaceholders(env, 'php');
  });
})(Prism);

Prism.languages.python = {
  'comment': {
    pattern: /(^|[^\\])#.*/,
    lookbehind: true
  },
  'string-interpolation': {
    pattern: /(?:f|rf|fr)(?:("""|''')[\s\S]+?\1|("|')(?:\\.|(?!\2)[^\\\r\n])*\2)/i,
    greedy: true,
    inside: {
      'interpolation': {
        // "{" <expression> <optional "!s", "!r", or "!a"> <optional ":" format specifier> "}"
        pattern: /((?:^|[^{])(?:{{)*){(?!{)(?:[^{}]|{(?!{)(?:[^{}]|{(?!{)(?:[^{}])+})+})+}/,
        lookbehind: true,
        inside: {
          'format-spec': {
            pattern: /(:)[^:(){}]+(?=}$)/,
            lookbehind: true
          },
          'conversion-option': {
            pattern: /![sra](?=[:}]$)/,
            alias: 'punctuation'
          },
          rest: null
        }
      },
      'string': /[\s\S]+/
    }
  },
  'triple-quoted-string': {
    pattern: /(?:[rub]|rb|br)?("""|''')[\s\S]+?\1/i,
    greedy: true,
    alias: 'string'
  },
  'string': {
    pattern: /(?:[rub]|rb|br)?("|')(?:\\.|(?!\1)[^\\\r\n])*\1/i,
    greedy: true
  },
  'function': {
    pattern: /((?:^|\s)def[ \t]+)[a-zA-Z_]\w*(?=\s*\()/g,
    lookbehind: true
  },
  'class-name': {
    pattern: /(\bclass\s+)\w+/i,
    lookbehind: true
  },
  'decorator': {
    pattern: /(^\s*)@\w+(?:\.\w+)*/i,
    lookbehind: true,
    alias: ['annotation', 'punctuation'],
    inside: {
      'punctuation': /\./
    }
  },
  'keyword': /\b(?:and|as|assert|async|await|break|class|continue|def|del|elif|else|except|exec|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|print|raise|return|try|while|with|yield)\b/,
  'builtin': /\b(?:__import__|abs|all|any|apply|ascii|basestring|bin|bool|buffer|bytearray|bytes|callable|chr|classmethod|cmp|coerce|compile|complex|delattr|dict|dir|divmod|enumerate|eval|execfile|file|filter|float|format|frozenset|getattr|globals|hasattr|hash|help|hex|id|input|int|intern|isinstance|issubclass|iter|len|list|locals|long|map|max|memoryview|min|next|object|oct|open|ord|pow|property|range|raw_input|reduce|reload|repr|reversed|round|set|setattr|slice|sorted|staticmethod|str|sum|super|tuple|type|unichr|unicode|vars|xrange|zip)\b/,
  'boolean': /\b(?:True|False|None)\b/,
  'number': /(?:\b(?=\d)|\B(?=\.))(?:0[bo])?(?:(?:\d|0x[\da-f])[\da-f]*\.?\d*|\.\d+)(?:e[+-]?\d+)?j?\b/i,
  'operator': /[-+%=]=?|!=|\*\*?=?|\/\/?=?|<[<=>]?|>[=>]?|[&|^~]/,
  'punctuation': /[{}[\];(),.:]/
};
Prism.languages.python['string-interpolation'].inside['interpolation'].inside.rest = Prism.languages.python;
Prism.languages.py = Prism.languages.python;

Prism.languages.r = {
  'comment': /#.*/,
  'string': {
    pattern: /(['"])(?:\\.|(?!\1)[^\\\r\n])*\1/,
    greedy: true
  },
  'percent-operator': {
    // Includes user-defined operators
    // and %%, %*%, %/%, %in%, %o%, %x%
    pattern: /%[^%\s]*%/,
    alias: 'operator'
  },
  'boolean': /\b(?:TRUE|FALSE)\b/,
  'ellipsis': /\.\.(?:\.|\d+)/,
  'number': [/\b(?:NaN|Inf)\b/, /(?:\b0x[\dA-Fa-f]+(?:\.\d*)?|\b\d+\.?\d*|\B\.\d+)(?:[EePp][+-]?\d+)?[iL]?/],
  'keyword': /\b(?:if|else|repeat|while|function|for|in|next|break|NULL|NA|NA_integer_|NA_real_|NA_complex_|NA_character_)\b/,
  'operator': /->?>?|<(?:=|<?-)?|[>=!]=?|::?|&&?|\|\|?|[+*\/^$@~]/,
  'punctuation': /[(){}\[\],;]/
};

/**
 * Original by Samuel Flores
 *
 * Adds the following new token classes:
 * 		constant, builtin, variable, symbol, regex
 */
(function (Prism) {
  Prism.languages.ruby = Prism.languages.extend('clike', {
    'comment': [/#.*/, {
      pattern: /^=begin\s[\s\S]*?^=end/m,
      greedy: true
    }],
    'keyword': /\b(?:alias|and|BEGIN|begin|break|case|class|def|define_method|defined|do|each|else|elsif|END|end|ensure|false|for|if|in|module|new|next|nil|not|or|protected|private|public|raise|redo|require|rescue|retry|return|self|super|then|throw|true|undef|unless|until|when|while|yield)\b/
  });
  var interpolation = {
    pattern: /#\{[^}]+\}/,
    inside: {
      'delimiter': {
        pattern: /^#\{|\}$/,
        alias: 'tag'
      },
      rest: Prism.languages.ruby
    }
  };
  delete Prism.languages.ruby.function;
  Prism.languages.insertBefore('ruby', 'keyword', {
    'regex': [{
      pattern: /%r([^a-zA-Z0-9\s{(\[<])(?:(?!\1)[^\\]|\\[\s\S])*\1[gim]{0,3}/,
      greedy: true,
      inside: {
        'interpolation': interpolation
      }
    }, {
      pattern: /%r\((?:[^()\\]|\\[\s\S])*\)[gim]{0,3}/,
      greedy: true,
      inside: {
        'interpolation': interpolation
      }
    }, {
      // Here we need to specifically allow interpolation
      pattern: /%r\{(?:[^#{}\\]|#(?:\{[^}]+\})?|\\[\s\S])*\}[gim]{0,3}/,
      greedy: true,
      inside: {
        'interpolation': interpolation
      }
    }, {
      pattern: /%r\[(?:[^\[\]\\]|\\[\s\S])*\][gim]{0,3}/,
      greedy: true,
      inside: {
        'interpolation': interpolation
      }
    }, {
      pattern: /%r<(?:[^<>\\]|\\[\s\S])*>[gim]{0,3}/,
      greedy: true,
      inside: {
        'interpolation': interpolation
      }
    }, {
      pattern: /(^|[^/])\/(?!\/)(\[.+?]|\\.|[^/\\\r\n])+\/[gim]{0,3}(?=\s*($|[\r\n,.;})]))/,
      lookbehind: true,
      greedy: true
    }],
    'variable': /[@$]+[a-zA-Z_]\w*(?:[?!]|\b)/,
    'symbol': {
      pattern: /(^|[^:]):[a-zA-Z_]\w*(?:[?!]|\b)/,
      lookbehind: true
    },
    'method-definition': {
      pattern: /(\bdef\s+)[\w.]+/,
      lookbehind: true,
      inside: {
        'function': /\w+$/,
        rest: Prism.languages.ruby
      }
    }
  });
  Prism.languages.insertBefore('ruby', 'number', {
    'builtin': /\b(?:Array|Bignum|Binding|Class|Continuation|Dir|Exception|FalseClass|File|Stat|Fixnum|Float|Hash|Integer|IO|MatchData|Method|Module|NilClass|Numeric|Object|Proc|Range|Regexp|String|Struct|TMS|Symbol|ThreadGroup|Thread|Time|TrueClass)\b/,
    'constant': /\b[A-Z]\w*(?:[?!]|\b)/
  });
  Prism.languages.ruby.string = [{
    pattern: /%[qQiIwWxs]?([^a-zA-Z0-9\s{(\[<])(?:(?!\1)[^\\]|\\[\s\S])*\1/,
    greedy: true,
    inside: {
      'interpolation': interpolation
    }
  }, {
    pattern: /%[qQiIwWxs]?\((?:[^()\\]|\\[\s\S])*\)/,
    greedy: true,
    inside: {
      'interpolation': interpolation
    }
  }, {
    // Here we need to specifically allow interpolation
    pattern: /%[qQiIwWxs]?\{(?:[^#{}\\]|#(?:\{[^}]+\})?|\\[\s\S])*\}/,
    greedy: true,
    inside: {
      'interpolation': interpolation
    }
  }, {
    pattern: /%[qQiIwWxs]?\[(?:[^\[\]\\]|\\[\s\S])*\]/,
    greedy: true,
    inside: {
      'interpolation': interpolation
    }
  }, {
    pattern: /%[qQiIwWxs]?<(?:[^<>\\]|\\[\s\S])*>/,
    greedy: true,
    inside: {
      'interpolation': interpolation
    }
  }, {
    pattern: /("|')(?:#\{[^}]+\}|\\(?:\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    greedy: true,
    inside: {
      'interpolation': interpolation
    }
  }];
  Prism.languages.rb = Prism.languages.ruby;
})(Prism);

Prism.languages.scala = Prism.languages.extend('java', {
  'keyword': /<-|=>|\b(?:abstract|case|catch|class|def|do|else|extends|final|finally|for|forSome|if|implicit|import|lazy|match|new|null|object|override|package|private|protected|return|sealed|self|super|this|throw|trait|try|type|val|var|while|with|yield)\b/,
  'string': [{
    pattern: /"""[\s\S]*?"""/,
    greedy: true
  }, {
    pattern: /("|')(?:\\.|(?!\1)[^\\\r\n])*\1/,
    greedy: true
  }],
  'builtin': /\b(?:String|Int|Long|Short|Byte|Boolean|Double|Float|Char|Any|AnyRef|AnyVal|Unit|Nothing)\b/,
  'number': /\b0x[\da-f]*\.?[\da-f]+|(?:\b\d+\.?\d*|\B\.\d+)(?:e\d+)?[dfl]?/i,
  'symbol': /'[^\d\s\\]\w*/
});
delete Prism.languages.scala['class-name'];
delete Prism.languages.scala['function'];

Prism.languages.scss = Prism.languages.extend('css', {
  'comment': {
    pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|\/\/.*)/,
    lookbehind: true
  },
  'atrule': {
    pattern: /@[\w-]+(?:\([^()]+\)|[^(])*?(?=\s+[{;])/,
    inside: {
      'rule': /@[\w-]+/ // See rest below

    }
  },
  // url, compassified
  'url': /(?:[-a-z]+-)?url(?=\()/i,
  // CSS selector regex is not appropriate for Sass
  // since there can be lot more things (var, @ directive, nesting..)
  // a selector must start at the end of a property or after a brace (end of other rules or nesting)
  // it can contain some characters that aren't used for defining rules or end of selector, & (parent selector), or interpolated variable
  // the end of a selector is found when there is no rules in it ( {} or {\s}) or if there is a property (because an interpolated var
  // can "pass" as a selector- e.g: proper#{$erty})
  // this one was hard to do, so please be careful if you edit this one :)
  'selector': {
    // Initial look-ahead is used to prevent matching of blank selectors
    pattern: /(?=\S)[^@;{}()]?(?:[^@;{}()]|#\{\$[-\w]+\})+(?=\s*\{(?:\}|\s|[^}]+[:{][^}]+))/m,
    inside: {
      'parent': {
        pattern: /&/,
        alias: 'important'
      },
      'placeholder': /%[-\w]+/,
      'variable': /\$[-\w]+|#\{\$[-\w]+\}/
    }
  },
  'property': {
    pattern: /(?:[\w-]|\$[-\w]+|#\{\$[-\w]+\})+(?=\s*:)/,
    inside: {
      'variable': /\$[-\w]+|#\{\$[-\w]+\}/
    }
  }
});
Prism.languages.insertBefore('scss', 'atrule', {
  'keyword': [/@(?:if|else(?: if)?|for|each|while|import|extend|debug|warn|mixin|include|function|return|content)/i, {
    pattern: /( +)(?:from|through)(?= )/,
    lookbehind: true
  }]
});
Prism.languages.insertBefore('scss', 'important', {
  // var and interpolated vars
  'variable': /\$[-\w]+|#\{\$[-\w]+\}/
});
Prism.languages.insertBefore('scss', 'function', {
  'placeholder': {
    pattern: /%[-\w]+/,
    alias: 'selector'
  },
  'statement': {
    pattern: /\B!(?:default|optional)\b/i,
    alias: 'keyword'
  },
  'boolean': /\b(?:true|false)\b/,
  'null': {
    pattern: /\bnull\b/,
    alias: 'keyword'
  },
  'operator': {
    pattern: /(\s)(?:[-+*\/%]|[=!]=|<=?|>=?|and|or|not)(?=\s)/,
    lookbehind: true
  }
});
Prism.languages.scss['atrule'].inside.rest = Prism.languages.scss;

(function (Prism) {
  // $ set | grep '^[A-Z][^[:space:]]*=' | cut -d= -f1 | tr '\n' '|'
  // + LC_ALL, RANDOM, REPLY, SECONDS.
  // + make sure PS1..4 are here as they are not always set,
  // - some useless things.
  var envVars = '\\b(?:BASH|BASHOPTS|BASH_ALIASES|BASH_ARGC|BASH_ARGV|BASH_CMDS|BASH_COMPLETION_COMPAT_DIR|BASH_LINENO|BASH_REMATCH|BASH_SOURCE|BASH_VERSINFO|BASH_VERSION|COLORTERM|COLUMNS|COMP_WORDBREAKS|DBUS_SESSION_BUS_ADDRESS|DEFAULTS_PATH|DESKTOP_SESSION|DIRSTACK|DISPLAY|EUID|GDMSESSION|GDM_LANG|GNOME_KEYRING_CONTROL|GNOME_KEYRING_PID|GPG_AGENT_INFO|GROUPS|HISTCONTROL|HISTFILE|HISTFILESIZE|HISTSIZE|HOME|HOSTNAME|HOSTTYPE|IFS|INSTANCE|JOB|LANG|LANGUAGE|LC_ADDRESS|LC_ALL|LC_IDENTIFICATION|LC_MEASUREMENT|LC_MONETARY|LC_NAME|LC_NUMERIC|LC_PAPER|LC_TELEPHONE|LC_TIME|LESSCLOSE|LESSOPEN|LINES|LOGNAME|LS_COLORS|MACHTYPE|MAILCHECK|MANDATORY_PATH|NO_AT_BRIDGE|OLDPWD|OPTERR|OPTIND|ORBIT_SOCKETDIR|OSTYPE|PAPERSIZE|PATH|PIPESTATUS|PPID|PS1|PS2|PS3|PS4|PWD|RANDOM|REPLY|SECONDS|SELINUX_INIT|SESSION|SESSIONTYPE|SESSION_MANAGER|SHELL|SHELLOPTS|SHLVL|SSH_AUTH_SOCK|TERM|UID|UPSTART_EVENTS|UPSTART_INSTANCE|UPSTART_JOB|UPSTART_SESSION|USER|WINDOWID|XAUTHORITY|XDG_CONFIG_DIRS|XDG_CURRENT_DESKTOP|XDG_DATA_DIRS|XDG_GREETER_DATA_DIR|XDG_MENU_PREFIX|XDG_RUNTIME_DIR|XDG_SEAT|XDG_SEAT_PATH|XDG_SESSION_DESKTOP|XDG_SESSION_ID|XDG_SESSION_PATH|XDG_SESSION_TYPE|XDG_VTNR|XMODIFIERS)\\b';
  var insideString = {
    'environment': {
      pattern: RegExp("\\$" + envVars),
      alias: 'constant'
    },
    'variable': [// [0]: Arithmetic Environment
    {
      pattern: /\$?\(\([\s\S]+?\)\)/,
      greedy: true,
      inside: {
        // If there is a $ sign at the beginning highlight $(( and )) as variable
        'variable': [{
          pattern: /(^\$\(\([\s\S]+)\)\)/,
          lookbehind: true
        }, /^\$\(\(/],
        'number': /\b0x[\dA-Fa-f]+\b|(?:\b\d+\.?\d*|\B\.\d+)(?:[Ee]-?\d+)?/,
        // Operators according to https://www.gnu.org/software/bash/manual/bashref.html#Shell-Arithmetic
        'operator': /--?|-=|\+\+?|\+=|!=?|~|\*\*?|\*=|\/=?|%=?|<<=?|>>=?|<=?|>=?|==?|&&?|&=|\^=?|\|\|?|\|=|\?|:/,
        // If there is no $ sign at the beginning highlight (( and )) as punctuation
        'punctuation': /\(\(?|\)\)?|,|;/
      }
    }, // [1]: Command Substitution
    {
      pattern: /\$\((?:\([^)]+\)|[^()])+\)|`[^`]+`/,
      greedy: true,
      inside: {
        'variable': /^\$\(|^`|\)$|`$/
      }
    }, // [2]: Brace expansion
    {
      pattern: /\$\{[^}]+\}/,
      greedy: true,
      inside: {
        'operator': /:[-=?+]?|[!\/]|##?|%%?|\^\^?|,,?/,
        'punctuation': /[\[\]]/,
        'environment': {
          pattern: RegExp("(\\{)" + envVars),
          lookbehind: true,
          alias: 'constant'
        }
      }
    }, /\$(?:\w+|[#?*!@$])/],
    // Escape sequences from echo and printf's manuals, and escaped quotes.
    'entity': /\\(?:[abceEfnrtv\\"]|O?[0-7]{1,3}|x[0-9a-fA-F]{1,2}|u[0-9a-fA-F]{4}|U[0-9a-fA-F]{8})/
  };
  Prism.languages.bash = {
    'shebang': {
      pattern: /^#!\s*\/.*/,
      alias: 'important'
    },
    'comment': {
      pattern: /(^|[^"{\\$])#.*/,
      lookbehind: true
    },
    'function-name': [// a) function foo {
    // b) foo() {
    // c) function foo() {
    // but not “foo {”
    {
      // a) and c)
      pattern: /(\bfunction\s+)\w+(?=(?:\s*\(?:\s*\))?\s*\{)/,
      lookbehind: true,
      alias: 'function'
    }, {
      // b)
      pattern: /\b\w+(?=\s*\(\s*\)\s*\{)/,
      alias: 'function'
    }],
    // Highlight variable names as variables in for and select beginnings.
    'for-or-select': {
      pattern: /(\b(?:for|select)\s+)\w+(?=\s+in\s)/,
      alias: 'variable',
      lookbehind: true
    },
    // Highlight variable names as variables in the left-hand part
    // of assignments (“=” and “+=”).
    'assign-left': {
      pattern: /(^|[\s;|&]|[<>]\()\w+(?=\+?=)/,
      inside: {
        'environment': {
          pattern: RegExp("(^|[\\s;|&]|[<>]\\()" + envVars),
          lookbehind: true,
          alias: 'constant'
        }
      },
      alias: 'variable',
      lookbehind: true
    },
    'string': [// Support for Here-documents https://en.wikipedia.org/wiki/Here_document
    {
      pattern: /((?:^|[^<])<<-?\s*)(\w+?)\s*(?:\r?\n|\r)(?:[\s\S])*?(?:\r?\n|\r)\2/,
      lookbehind: true,
      greedy: true,
      inside: insideString
    }, // Here-document with quotes around the tag
    // → No expansion (so no “inside”).
    {
      pattern: /((?:^|[^<])<<-?\s*)(["'])(\w+)\2\s*(?:\r?\n|\r)(?:[\s\S])*?(?:\r?\n|\r)\3/,
      lookbehind: true,
      greedy: true
    }, // “Normal” string
    {
      pattern: /(["'])(?:\\[\s\S]|\$\([^)]+\)|`[^`]+`|(?!\1)[^\\])*\1/,
      greedy: true,
      inside: insideString
    }],
    'environment': {
      pattern: RegExp("\\$?" + envVars),
      alias: 'constant'
    },
    'variable': insideString.variable,
    'function': {
      pattern: /(^|[\s;|&]|[<>]\()(?:add|apropos|apt|aptitude|apt-cache|apt-get|aspell|automysqlbackup|awk|basename|bash|bc|bconsole|bg|bzip2|cal|cat|cfdisk|chgrp|chkconfig|chmod|chown|chroot|cksum|clear|cmp|column|comm|cp|cron|crontab|csplit|curl|cut|date|dc|dd|ddrescue|debootstrap|df|diff|diff3|dig|dir|dircolors|dirname|dirs|dmesg|du|egrep|eject|env|ethtool|expand|expect|expr|fdformat|fdisk|fg|fgrep|file|find|fmt|fold|format|free|fsck|ftp|fuser|gawk|git|gparted|grep|groupadd|groupdel|groupmod|groups|grub-mkconfig|gzip|halt|head|hg|history|host|hostname|htop|iconv|id|ifconfig|ifdown|ifup|import|install|ip|jobs|join|kill|killall|less|link|ln|locate|logname|logrotate|look|lpc|lpr|lprint|lprintd|lprintq|lprm|ls|lsof|lynx|make|man|mc|mdadm|mkconfig|mkdir|mke2fs|mkfifo|mkfs|mkisofs|mknod|mkswap|mmv|more|most|mount|mtools|mtr|mutt|mv|nano|nc|netstat|nice|nl|nohup|notify-send|npm|nslookup|op|open|parted|passwd|paste|pathchk|ping|pkill|pnpm|popd|pr|printcap|printenv|ps|pushd|pv|quota|quotacheck|quotactl|ram|rar|rcp|reboot|remsync|rename|renice|rev|rm|rmdir|rpm|rsync|scp|screen|sdiff|sed|sendmail|seq|service|sftp|sh|shellcheck|shuf|shutdown|sleep|slocate|sort|split|ssh|stat|strace|su|sudo|sum|suspend|swapon|sync|tac|tail|tar|tee|time|timeout|top|touch|tr|traceroute|tsort|tty|umount|uname|unexpand|uniq|units|unrar|unshar|unzip|update-grub|uptime|useradd|userdel|usermod|users|uudecode|uuencode|v|vdir|vi|vim|virsh|vmstat|wait|watch|wc|wget|whereis|which|who|whoami|write|xargs|xdg-open|yarn|yes|zenity|zip|zsh|zypper)(?=$|[)\s;|&])/,
      lookbehind: true
    },
    'keyword': {
      pattern: /(^|[\s;|&]|[<>]\()(?:if|then|else|elif|fi|for|while|in|case|esac|function|select|do|done|until)(?=$|[)\s;|&])/,
      lookbehind: true
    },
    // https://www.gnu.org/software/bash/manual/html_node/Shell-Builtin-Commands.html
    'builtin': {
      pattern: /(^|[\s;|&]|[<>]\()(?:\.|:|break|cd|continue|eval|exec|exit|export|getopts|hash|pwd|readonly|return|shift|test|times|trap|umask|unset|alias|bind|builtin|caller|command|declare|echo|enable|help|let|local|logout|mapfile|printf|read|readarray|source|type|typeset|ulimit|unalias|set|shopt)(?=$|[)\s;|&])/,
      lookbehind: true,
      // Alias added to make those easier to distinguish from strings.
      alias: 'class-name'
    },
    'boolean': {
      pattern: /(^|[\s;|&]|[<>]\()(?:true|false)(?=$|[)\s;|&])/,
      lookbehind: true
    },
    'file-descriptor': {
      pattern: /\B&\d\b/,
      alias: 'important'
    },
    'operator': {
      // Lots of redirections here, but not just that.
      pattern: /\d?<>|>\||\+=|==?|!=?|=~|<<[<-]?|[&\d]?>>|\d?[<>]&?|&[>&]?|\|[&|]?|<=?|>=?/,
      inside: {
        'file-descriptor': {
          pattern: /^\d/,
          alias: 'important'
        }
      }
    },
    'punctuation': /\$?\(\(?|\)\)?|\.\.|[{}[\];\\]/,
    'number': {
      pattern: /(^|\s)(?:[1-9]\d*|0)(?:[.,]\d+)?\b/,
      lookbehind: true
    }
  };
  /* Patterns in command substitution. */

  var toBeCopied = ['comment', 'function-name', 'for-or-select', 'assign-left', 'string', 'environment', 'function', 'keyword', 'builtin', 'boolean', 'file-descriptor', 'operator', 'punctuation', 'number'];
  var inside = insideString.variable[1].inside;

  for (var i = 0; i < toBeCopied.length; i++) {
    inside[toBeCopied[i]] = Prism.languages.bash[toBeCopied[i]];
  }

  Prism.languages.shell = Prism.languages.bash;
})(Prism);

Prism.languages.sql = {
  'comment': {
    pattern: /(^|[^\\])(?:\/\*[\s\S]*?\*\/|(?:--|\/\/|#).*)/,
    lookbehind: true
  },
  'variable': [{
    pattern: /@(["'`])(?:\\[\s\S]|(?!\1)[^\\])+\1/,
    greedy: true
  }, /@[\w.$]+/],
  'string': {
    pattern: /(^|[^@\\])("|')(?:\\[\s\S]|(?!\2)[^\\]|\2\2)*\2/,
    greedy: true,
    lookbehind: true
  },
  'function': /\b(?:AVG|COUNT|FIRST|FORMAT|LAST|LCASE|LEN|MAX|MID|MIN|MOD|NOW|ROUND|SUM|UCASE)(?=\s*\()/i,
  // Should we highlight user defined functions too?
  'keyword': /\b(?:ACTION|ADD|AFTER|ALGORITHM|ALL|ALTER|ANALYZE|ANY|APPLY|AS|ASC|AUTHORIZATION|AUTO_INCREMENT|BACKUP|BDB|BEGIN|BERKELEYDB|BIGINT|BINARY|BIT|BLOB|BOOL|BOOLEAN|BREAK|BROWSE|BTREE|BULK|BY|CALL|CASCADED?|CASE|CHAIN|CHAR(?:ACTER|SET)?|CHECK(?:POINT)?|CLOSE|CLUSTERED|COALESCE|COLLATE|COLUMNS?|COMMENT|COMMIT(?:TED)?|COMPUTE|CONNECT|CONSISTENT|CONSTRAINT|CONTAINS(?:TABLE)?|CONTINUE|CONVERT|CREATE|CROSS|CURRENT(?:_DATE|_TIME|_TIMESTAMP|_USER)?|CURSOR|CYCLE|DATA(?:BASES?)?|DATE(?:TIME)?|DAY|DBCC|DEALLOCATE|DEC|DECIMAL|DECLARE|DEFAULT|DEFINER|DELAYED|DELETE|DELIMITERS?|DENY|DESC|DESCRIBE|DETERMINISTIC|DISABLE|DISCARD|DISK|DISTINCT|DISTINCTROW|DISTRIBUTED|DO|DOUBLE|DROP|DUMMY|DUMP(?:FILE)?|DUPLICATE|ELSE(?:IF)?|ENABLE|ENCLOSED|END|ENGINE|ENUM|ERRLVL|ERRORS|ESCAPED?|EXCEPT|EXEC(?:UTE)?|EXISTS|EXIT|EXPLAIN|EXTENDED|FETCH|FIELDS|FILE|FILLFACTOR|FIRST|FIXED|FLOAT|FOLLOWING|FOR(?: EACH ROW)?|FORCE|FOREIGN|FREETEXT(?:TABLE)?|FROM|FULL|FUNCTION|GEOMETRY(?:COLLECTION)?|GLOBAL|GOTO|GRANT|GROUP|HANDLER|HASH|HAVING|HOLDLOCK|HOUR|IDENTITY(?:_INSERT|COL)?|IF|IGNORE|IMPORT|INDEX|INFILE|INNER|INNODB|INOUT|INSERT|INT|INTEGER|INTERSECT|INTERVAL|INTO|INVOKER|ISOLATION|ITERATE|JOIN|KEYS?|KILL|LANGUAGE|LAST|LEAVE|LEFT|LEVEL|LIMIT|LINENO|LINES|LINESTRING|LOAD|LOCAL|LOCK|LONG(?:BLOB|TEXT)|LOOP|MATCH(?:ED)?|MEDIUM(?:BLOB|INT|TEXT)|MERGE|MIDDLEINT|MINUTE|MODE|MODIFIES|MODIFY|MONTH|MULTI(?:LINESTRING|POINT|POLYGON)|NATIONAL|NATURAL|NCHAR|NEXT|NO|NONCLUSTERED|NULLIF|NUMERIC|OFF?|OFFSETS?|ON|OPEN(?:DATASOURCE|QUERY|ROWSET)?|OPTIMIZE|OPTION(?:ALLY)?|ORDER|OUT(?:ER|FILE)?|OVER|PARTIAL|PARTITION|PERCENT|PIVOT|PLAN|POINT|POLYGON|PRECEDING|PRECISION|PREPARE|PREV|PRIMARY|PRINT|PRIVILEGES|PROC(?:EDURE)?|PUBLIC|PURGE|QUICK|RAISERROR|READS?|REAL|RECONFIGURE|REFERENCES|RELEASE|RENAME|REPEAT(?:ABLE)?|REPLACE|REPLICATION|REQUIRE|RESIGNAL|RESTORE|RESTRICT|RETURNS?|REVOKE|RIGHT|ROLLBACK|ROUTINE|ROW(?:COUNT|GUIDCOL|S)?|RTREE|RULE|SAVE(?:POINT)?|SCHEMA|SECOND|SELECT|SERIAL(?:IZABLE)?|SESSION(?:_USER)?|SET(?:USER)?|SHARE|SHOW|SHUTDOWN|SIMPLE|SMALLINT|SNAPSHOT|SOME|SONAME|SQL|START(?:ING)?|STATISTICS|STATUS|STRIPED|SYSTEM_USER|TABLES?|TABLESPACE|TEMP(?:ORARY|TABLE)?|TERMINATED|TEXT(?:SIZE)?|THEN|TIME(?:STAMP)?|TINY(?:BLOB|INT|TEXT)|TOP?|TRAN(?:SACTIONS?)?|TRIGGER|TRUNCATE|TSEQUAL|TYPES?|UNBOUNDED|UNCOMMITTED|UNDEFINED|UNION|UNIQUE|UNLOCK|UNPIVOT|UNSIGNED|UPDATE(?:TEXT)?|USAGE|USE|USER|USING|VALUES?|VAR(?:BINARY|CHAR|CHARACTER|YING)|VIEW|WAITFOR|WARNINGS|WHEN|WHERE|WHILE|WITH(?: ROLLUP|IN)?|WORK|WRITE(?:TEXT)?|YEAR)\b/i,
  'boolean': /\b(?:TRUE|FALSE|NULL)\b/i,
  'number': /\b0x[\da-f]+\b|\b\d+\.?\d*|\B\.\d+\b/i,
  'operator': /[-+*\/=%^~]|&&?|\|\|?|!=?|<(?:=>?|<|>)?|>[>=]?|\b(?:AND|BETWEEN|IN|LIKE|NOT|OR|IS|DIV|REGEXP|RLIKE|SOUNDS LIKE|XOR)\b/i,
  'punctuation': /[;[\]()`,.]/
};

// issues: nested multiline comments
Prism.languages.swift = Prism.languages.extend('clike', {
  'string': {
    pattern: /("|')(\\(?:\((?:[^()]|\([^)]+\))+\)|\r\n|[\s\S])|(?!\1)[^\\\r\n])*\1/,
    greedy: true,
    inside: {
      'interpolation': {
        pattern: /\\\((?:[^()]|\([^)]+\))+\)/,
        inside: {
          delimiter: {
            pattern: /^\\\(|\)$/,
            alias: 'variable'
          } // See rest below

        }
      }
    }
  },
  'keyword': /\b(?:as|associativity|break|case|catch|class|continue|convenience|default|defer|deinit|didSet|do|dynamic(?:Type)?|else|enum|extension|fallthrough|final|for|func|get|guard|if|import|in|infix|init|inout|internal|is|lazy|left|let|mutating|new|none|nonmutating|operator|optional|override|postfix|precedence|prefix|private|protocol|public|repeat|required|rethrows|return|right|safe|self|Self|set|static|struct|subscript|super|switch|throws?|try|Type|typealias|unowned|unsafe|var|weak|where|while|willSet|__(?:COLUMN__|FILE__|FUNCTION__|LINE__))\b/,
  'number': /\b(?:[\d_]+(?:\.[\de_]+)?|0x[a-f0-9_]+(?:\.[a-f0-9p_]+)?|0b[01_]+|0o[0-7_]+)\b/i,
  'constant': /\b(?:nil|[A-Z_]{2,}|k[A-Z][A-Za-z_]+)\b/,
  'atrule': /@\b(?:IB(?:Outlet|Designable|Action|Inspectable)|class_protocol|exported|noreturn|NS(?:Copying|Managed)|objc|UIApplicationMain|auto_closure)\b/,
  'builtin': /\b(?:[A-Z]\S+|abs|advance|alignof(?:Value)?|assert|contains|count(?:Elements)?|debugPrint(?:ln)?|distance|drop(?:First|Last)|dump|enumerate|equal|filter|find|first|getVaList|indices|isEmpty|join|last|lexicographicalCompare|map|max(?:Element)?|min(?:Element)?|numericCast|overlaps|partition|print(?:ln)?|reduce|reflect|reverse|sizeof(?:Value)?|sort(?:ed)?|split|startsWith|stride(?:of(?:Value)?)?|suffix|swap|toDebugString|toString|transcode|underestimateCount|unsafeBitCast|with(?:ExtendedLifetime|Unsafe(?:MutablePointers?|Pointers?)|VaList))\b/
});
Prism.languages.swift['string'].inside['interpolation'].inside.rest = Prism.languages.swift;

(function (Prism) {
  var funcPattern = /\\(?:[^a-z()[\]]|[a-z*]+)/i;
  var insideEqu = {
    'equation-command': {
      pattern: funcPattern,
      alias: 'regex'
    }
  };
  Prism.languages.latex = {
    'comment': /%.*/m,
    // the verbatim environment prints whitespace to the document
    'cdata': {
      pattern: /(\\begin\{((?:verbatim|lstlisting)\*?)\})[\s\S]*?(?=\\end\{\2\})/,
      lookbehind: true
    },

    /*
     * equations can be between $$ $$ or $ $ or \( \) or \[ \]
     * (all are multiline)
     */
    'equation': [{
      pattern: /\$\$(?:\\[\s\S]|[^\\$])+\$\$|\$(?:\\[\s\S]|[^\\$])+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/,
      inside: insideEqu,
      alias: 'string'
    }, {
      pattern: /(\\begin\{((?:equation|math|eqnarray|align|multline|gather)\*?)\})[\s\S]*?(?=\\end\{\2\})/,
      lookbehind: true,
      inside: insideEqu,
      alias: 'string'
    }],

    /*
     * arguments which are keywords or references are highlighted
     * as keywords
     */
    'keyword': {
      pattern: /(\\(?:begin|end|ref|cite|label|usepackage|documentclass)(?:\[[^\]]+\])?\{)[^}]+(?=\})/,
      lookbehind: true
    },
    'url': {
      pattern: /(\\url\{)[^}]+(?=\})/,
      lookbehind: true
    },

    /*
     * section or chapter headlines are highlighted as bold so that
     * they stand out more
     */
    'headline': {
      pattern: /(\\(?:part|chapter|section|subsection|frametitle|subsubsection|paragraph|subparagraph|subsubparagraph|subsubsubparagraph)\*?(?:\[[^\]]+\])?\{)[^}]+(?=\}(?:\[[^\]]+\])?)/,
      lookbehind: true,
      alias: 'class-name'
    },
    'function': {
      pattern: funcPattern,
      alias: 'selector'
    },
    'punctuation': /[[\]{}&]/
  };
  Prism.languages.tex = Prism.languages.latex;
  Prism.languages.context = Prism.languages.latex;
})(Prism);

Object.assign(prism.languages, {
  apache: prism.languages.apacheconf,
  'c++': prism.languages.cpp,
  'c#': prism.languages.csharp,
  golang: prism.languages.go,
  mat: prism.languages.matlab,
  objc: prism.languages.objectivec,
  py: prism.languages.python,
  sc: prism.languages.scala,
  sh: prism.languages.bash,
  shell: prism.languages.bash,
  tex: prism.languages.latex
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
  const content = Array.isArray(token.content) ? token.content.map(tokenToNode) : [tokenToNode(token.content)];
  const node = document.createElement('span');
  const className = styles$1[token.type.trim()];
  if (className) node.className = className;
  node.append(...content);
  return node;
}

const TIMEOUT = 500;
function highlightPlugin() {
  let cb;
  return {
    afterchange(editor) {
      if (cb) clearTimeout(cb); // Wait until typing has stopped

      cb = setTimeout(() => {
        cb = undefined;

        for (const block of editor.state) {
          if (block.type !== 'code_block') continue;
          const index = editor.state.indexOf(block);
          const {
            content: [, language,, code]
          } = block;
          const blockNode = editor.element.children[index]; // Already highlighted

          if (blockNode.childNodes.length !== 6) continue;
          const grammar = prism.languages[language.trim()];
          if (!grammar) continue;
          const {
            anchorBlock,
            anchorOffset,
            focusBlock,
            focusOffset
          } = editor.selection;
          const tokens = prism.tokenize(code, grammar);
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

const FORMATS = {
  formatBold: '**',
  formatItalic: '*',
  formatUnderline: '~'
};
function formatPlugin() {
  return {
    handlers: {
      beforeinput(editor, event) {
        if (!(event.inputType in FORMATS)) return;
        event.preventDefault();
        console.log('format', event.inputType);
      }

    }
  };
}

const TYPE = 'ordered_list_item';

function changeCaret(caret, blockIndex, offset, diff) {
  if (caret[0] >= blockIndex && caret[1] >= offset) {
    caret[1] -= diff;
  }
}
/**
 * Ensure numbering of ordered list is correct
 */


function orderedList() {
  return {
    beforeupdate(editor, state, caret) {
      const newState = state.slice();
      const newCaret = {
        anchor: caret.anchor.slice(),
        focus: caret.focus.slice()
      };
      let changed = false;

      for (const block of state) {
        if (block.type !== TYPE) continue;
        const index = state.indexOf(block);
        const indentation = block.content[0];
        let n = index - 1;

        while (state[n] && newState[n].type === TYPE) {
          if (newState[n].content[0] === indentation) {
            const number = parseInt(newState[n].content[1]) + 1; // Avoid exponential notation

            const numberString = number.toLocaleString(undefined, {
              useGrouping: false
            });
            if (numberString === newState[index].content[1]) break;
            changed = true;
            const posDiff = block.content[1].length - numberString.length;
            const offset = indentation.length;
            newState[index] = { ...block,
              content: [indentation, numberString, ...block.content.slice(2)]
            };
            changeCaret(newCaret.anchor, index, offset, posDiff);
            changeCaret(newCaret.focus, index, offset, posDiff);
            break;
          }

          n--;
        }
      }

      if (!changed) return;
      return {
        state: newState,
        caret: newCaret
      };
    }

  };
}

/**
 * Document.caretPositionFromPoint() is only supported by Firefox.
 * Other browsers support non-standard Document.caretRangeFromPoint()
 * Chrome: http://crbug.com/388976
 * Safari: https://bugs.webkit.org/show_bug.cgi?id=172137
 * Edge: https://connect.microsoft.com/IE/feedback/details/693228/implement-document-caretpositionfrompoint
 */

function caretPositionFromPoint(node, x, y) {
  const root = node.getRootNode();

  if (root.caretPositionFromPoint) {
    return root.caretPositionFromPoint(x, y);
  }

  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;
  return {
    offset: range.startOffset,
    offsetNode: range.startContainer
  };
}

function getPositionFromPoint(editor, {
  clientX,
  clientY
}) {
  const pos = caretPositionFromPoint(editor.element, clientX, clientY);
  const block = findBlockIndex(editor.element, pos.offsetNode);
  const offset = getOffset(editor.element.children[block], pos.offsetNode, pos.offset);
  return {
    block,
    offset
  };
}

function generateId() {
  return Math.random().toString(36).slice(2, 7);
}

function getDropValue(dataTransfer) {
  if (dataTransfer.files.length) {
    return Array.from(dataTransfer.files).map(file => {
      const type = file.type.startsWith('image/') ? 'image' : 'file';
      const id = generateId();
      const url = URL.createObjectURL(file);
      set(id, url);
      return `[${type}:${id}/${file.name}]`;
    }).join('');
  }

  return dataTransfer.getData('text/plain');
}

function dropPlugin() {
  return {
    handlers: {
      drop(editor, event) {
        if (!event.dataTransfer) return;
        event.preventDefault();
        const {
          block,
          offset
        } = getPositionFromPoint(editor, event);
        const text = getDropValue(event.dataTransfer);
        const line = serializeState(editor.state[block].content);
        editor.update(getNewState(editor, block, block, line.slice(0, offset) + text + line.slice(offset)), [block, offset + text.length]);
      }

    }
  };
}

class DefaultEditor extends Editor {
  constructor({
    element,
    value
  } = {}) {
    element.classList.add(styles.editor);
    const plugins = [enterPlugin(), tabPlugin(), historyPlugin(), highlightPlugin(), formatPlugin(), orderedList(), dropPlugin()];
    super({
      element,
      value,
      plugins,
      renderer,
      parser: parseBlock
    });
  }

}

var value = `# Writing on the web
Just some sample text, that demonstrates **bold text**, _italic text_, ~underlined text~, and ~~strikethrough~~.

It is also possible to [Link to websites](https://example.com), have \`inline code\`, and use separators:
***

#hashtags can be used to organize, even with #multiple words#

* lists can be useful
- to list multiple things

1. And they can be ordered
    1. and nested
2. and contain *styling*

- [ ] There is support for checkboxes
- [x] Checked and unchecked

> There is quotes
> They look like this!

#### And smaller headings look like this

There is ::marks:: and [[Note references]]

\`\`\`javascript
// There is code blocks aswell
function working() {
  return Math.random() > .5;
}
\`\`\`

And there is of course support for images and files:

[image:5457B1BB-5EB1-41D8-8C5B-85B4522A8162-62139-000178299718391D/cub.jpg]

[file:999F2B01-AD94-4FE3-923E-B39C7C51962C-16057-00005A56C2010437/Writing on the web.md]
`;

set('5457B1BB-5EB1-41D8-8C5B-85B4522A8162-62139-000178299718391D', 'cub.jpg');
set('999F2B01-AD94-4FE3-923E-B39C7C51962C-16057-00005A56C2010437', URL.createObjectURL(new File([value], 'Writing on the web.md')));
const element = document.querySelector('#editor');
window.editor = new DefaultEditor({
  element,
  value
});
//# sourceMappingURL=main.js.map
