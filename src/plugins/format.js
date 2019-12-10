const FORMATS = {
  formatBold: '**',
  formatItalic: '*',
  formatUnderline: '~'
};

export default function formatPlugin() {
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
