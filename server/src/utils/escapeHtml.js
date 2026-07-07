// OPT-024: escape the 5 characters that are meaningful in HTML/attribute
// context. Use before interpolating any user-supplied string into an HTML
// email/page — never on values that are already-trusted markup.
const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

module.exports = {
  escapeHtml,
};
