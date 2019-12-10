/** @jsx h */
/** @jsxFrag Fragment */
import {
  /* eslint-disable-next-line no-unused-vars */
  h, Fragment,
  cls, last, formatURL
} from './helpers.js';
import styles from './styles.css';
import { get as getFileURL } from './files.js';

function onTodoClick({ target }) {
  const checked = target.getAttribute('aria-checked') === 'true';
  target.dataset.text = `- [${!checked ? 'x' : ' '}]`;
  target.dispatchEvent(new Event('input', { bubbles: true }));
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

export default {
  paragraph({ content }) {
    return <p class={styles.p}>{content}</p>;
  },
  heading({ content: [hashes, ...content] }) {
    const level = hashes.length;
    const Heading = `h${level}`;

    return (
      <Heading class={cls(styles.heading, styles[Heading])}>
        <button
          contenteditable="false"
          type="button"
          class={styles.heading_button}
          data-text={hashes}
          onclick={onHeadingClick}
          onmousedown={preventDefault /* Prevent editor focus on mobile */}
        >
          <div>
            {/* Wrapper makes deleteSoftLineBackward work on Chrome */}
            h<span class={styles.heading_button_level}>{level}</span>
          </div>
        </button>
        {content}
      </Heading>
    );
  },
  ordered_list_item({ content: [indentation, level, markup, ...content] }) {
    return (
      <li class={styles.ordered_list_item}>
        {indentation}
        <span class={styles.ordered_list_item_number}>{level}</span>
        <span class={styles.ordered_list_item_dot}>{markup}</span>{content}
      </li>
    );
  },
  unordered_list_item({ content: [indentation, markup, ...content] }) {
    return (
      <li class={styles.unordered_list_item}>
        {indentation}
        <span class={styles.unordered_list_item_dot}>{markup}</span>{content}
      </li>
    );
  },
  todo_item({ content: [indentation, text, space, ...content] }) {
    const checked = text === '- [x]';

    return (
      <li class={styles.todo_item}>
        {indentation}
        <button
          contenteditable="false"
          type="button"
          role="checkbox"
          aria-checked={checked}
          class={styles.checkbox}
          data-text={text}
          onclick={onTodoClick}
          onmousedown={preventDefault /* Prevent editor focus on mobile */}
        >
          {/* Wrapper required for caret position for Chrome */}
          <div class={styles.checkbox_svg}>
            {/* Zero-Width Space makes deleteSoftLineBackward on Chrome */}
            {String.fromCharCode(8203)}
            <svg width="17" height="17" viewBox="0 0 16 16">
              <path
                d="M.5 12.853A2.647 2.647 0 003.147 15.5h9.706a2.647 2.647 0 002.647-2.647V3.147A2.647 2.647 0 0012.853.5H3.147A2.647 2.647 0 00.5 3.147v9.706z"
                class={styles.checkbox_background}
              />
              {checked ? <path
                d="M12.526 4.615L6.636 9.58l-2.482-.836a.48.48 0 00-.518.15.377.377 0 00.026.495l2.722 2.91c.086.09.21.144.34.144h.046a.474.474 0 00.307-.156l6.1-7.125a.38.38 0 00-.046-.548.49.49 0 00-.604 0z"
                class={styles.icon}
              /> : ''}
            </svg>
          </div>
        </button>
        {space}
        <span class={checked ? styles.todo_item_done : ''}>{content}</span>
      </li>
    );
  },
  blockquote({ content: [markup, ...content] }) {
    return (
      <blockquote class={styles.blockquote}>
        <span class={styles.blockquote_markup}>{markup}</span>{content}
      </blockquote>
    );
  },
  horizontal_rule({ content }) {
    return (
      /* Enables caret positions */
      <p class={styles.p}>
        <img role="presentation" class={styles.hr} data-text={content} />
      </p>
    );
  },
  code_block({ content: [openMarkup, language, ...content] }) {
    return (
      <code
        class={styles.code_block}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
      >
        <span class={styles.inline_markup}>{openMarkup}</span>
        <span class={styles.code_language}>{language}</span>
        {content.slice(0, -1)}
        <span class={cls(styles.inline_markup, styles.code_close)}>
          {last(content)}
        </span>
      </code>
    );
  },

  em({ content }) {
    return (
      <>
        <span class={styles.inline_markup}>{content[0]}</span>
        <em>{content.slice(1, -1)}</em>
        <span class={styles.inline_markup}>{last(content)}</span>
      </>
    );
  },
  strong({ content }) {
    return (
      <>
        <span class={styles.inline_markup}>{content[0]}</span>
        <strong>{content.slice(1, -1)}</strong>
        <span class={styles.inline_markup}>{last(content)}</span>
      </>
    );
  },
  link({ content: [openBrckt, text, closeBrckt, openPar, link, closePar] }) {
    return (
      <>
        <span class={cls(styles.inline_markup, styles.link_open)}>
          {openBrckt}
        </span>
        <a
          href={link}
          target="_blank"
          class={styles.link}
          onclick={onLinkClick}
        >{text}</a>
        <span class={cls(styles.inline_markup, styles.link_close)}>
          {closeBrckt}
        </span>
        <span class={styles.link_nowrap}>
          <span class={styles.inline_markup}>
            {openPar}
          </span>
          <button
            contenteditable="false"
            type="button"
            data-text={link}
            class={styles.link_button}
            onclick={onLinkButtonClick}
            onmousedown={preventDefault /* Prevent editor focus on mobile */}
          >
            <svg width="12" height="12" viewBox="0 0 14 14">
              <path
                d="M10.593 1.17a2.305 2.305 0 00-1.667.691l-.003.002-.964.975c-.525.53-.864 1.096-1.006 1.557-.152.493-.038.684.014.73l-.806.89c-.575-.522-.555-1.324-.355-1.974.21-.682.67-1.41 1.3-2.047l.964-.974a3.505 3.505 0 014.923-.08l.002-.001.002.001.068.07.054.057-.003.003a3.62 3.62 0 01-.2 4.97l-.875.85c-.707.689-1.6 1.002-2.293 1.138a5.128 5.128 0 01-.91.098c-.12.001-.23-.003-.322-.014a1.176 1.176 0 01-.153-.026.635.635 0 01-.327-.186l.875-.822a.565.565 0 00-.261-.158c.03.003.09.007.175.006.171-.002.415-.021.692-.076.564-.11 1.207-.352 1.686-.819l.875-.85a2.42 2.42 0 00.097-3.363 2.306 2.306 0 00-1.582-.649z M10.848 4L4 10.848 3.151 10 10 3.151l.848.849z M3.968 5.84c.62-.217 1.42-.298 1.955.235l-.846.85c-.02-.02-.2-.132-.714.048-.467.163-1.04.519-1.58 1.05l-.872.854a2.28 2.28 0 00.793 3.772 2.37 2.37 0 002.58-.592l.732-.782c.459-.49.701-1.151.817-1.732.056-.285.08-.536.086-.713.003-.09.001-.154 0-.19l-.002-.016v.007a.436.436 0 00.043.13.586.586 0 00.116.163l.848-.848c.113.112.15.242.154.258v.001c.013.04.02.075.023.097.008.046.012.093.015.133.005.085.006.19.002.307a5.766 5.766 0 01-.109.905c-.138.697-.446 1.601-1.117 2.318l-.733.782a3.57 3.57 0 01-5.04.169 3.48 3.48 0 01-.046-5.028l.869-.852C2.58 6.539 3.3 6.072 3.968 5.84z"
                class={styles.icon}
              />
            </svg>
          </button>
          <span class={styles.inline_markup}>{closePar}</span>
        </span>
      </>
    );
  },
  code({ content }) {
    return (
      <code
        class={styles.code_span}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
      >
        <span class={styles.code_span_inner}>
          <span class={styles.code_span_open}>{content[0]}</span>
          {content.slice(1, -1)}
          <span class={styles.code_span_close}>{last(content)}</span>
        </span>
      </code>
    );
  },
  reference({ content }) {
    return (
      <>
        <span class={styles.inline_markup}>{content[0]}</span>
        <span class={styles.reference}>{content.slice(1, -1)}</span>
        <span class={styles.inline_markup}>{last(content)}</span>
      </>
    );
  },
  mark({ content }) {
    return (
      <mark class={styles.mark}>
        <span class={styles.mark_markup}>{content[0]}</span>
        {content.slice(1, -1)}
        <span class={styles.mark_markup}>{last(content)}</span>
      </mark>
    );
  },
  strikethrough({ content }) {
    return (
      <span class={styles.strikethrough}>
        {content[0]}<s>{content.slice(1, -1)}</s>{last(content)}
      </span>
    );
  },
  underline({ content }) {
    return (
      <>
        <span class={styles.inline_markup}>{content[0]}</span>
        <u class={styles.underline}>{content.slice(1, -1)}</u>
        <span class={styles.inline_markup}>{last(content)}</span>
      </>
    );
  },
  tag({ content }) {
    return (
      // <button> can't have multi-line background
      <span role="button" tabindex="0" class={styles.tag} onclick={onTagClick}>
        <span class={styles.tag_markup}>{content[0]}</span>
        {content.slice(1, -1)}
        <span class={styles.tag_markup}>{last(content)}</span>
      </span>
    );
  },
  image({ content }) {
    const [id, name] = content[1].split('/');

    return <img
      src={getFileURL(id)}
      alt={name}
      class={styles.image}
      data-text={content.join('')}
      onclick={selectElement}
    />;
  },
  file({ content }) {
    const [id, name] = content[1].split('/');

    return (
      <button
        contenteditable="false"
        type="button"
        class={styles.file}
        data-text={content.join('')}
        data-name={name}
        data-id={id}
        data-date=""
        onmousedown={preventDefault /* Prevent editor focus on mobile */}
        onclick={selectElement}
      >
        {/* Wrapper required for caret position for Chrome */}
        <div class={styles.file_svg}>
          <svg width="32" height="38">
            <path
              d="M0 0h20.693L32 10.279V38H0V0zm1 1v36h30V11H19V1H1zm19 0v9h10.207l-9.9-9H20z"
            />
          </svg>
        </div>
      </button>
    );
  }
};
