const STYLE_ID = 'jobmager-styles';

export const CSS_TEXT = `
.jobmager-filled {
  outline: 2px solid #16a34a !important;
  outline-offset: 1px !important;
  background-color: rgba(22, 163, 74, 0.07) !important;
  transition: outline-color .2s ease;
}
.jobmager-empty {
  outline: 2px dashed #ca8a04 !important;
  outline-offset: 1px !important;
  background-color: rgba(202, 138, 4, 0.07) !important;
}
.jobmager-prompt {
  position: absolute;
  z-index: 2147483647;
  font: 500 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, .18);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 320px;
}
.jobmager-prompt button {
  font: inherit;
  border-radius: 6px;
  border: 1px solid transparent;
  padding: 4px 9px;
  cursor: pointer;
}
.jobmager-prompt .jm-yes { background: #4f46e5; color: #fff; }
.jobmager-prompt .jm-yes:hover { background: #4338ca; }
.jobmager-prompt .jm-no { background: transparent; color: #6b7280; border-color: #d1d5db; }
.jobmager-prompt .jm-no:hover { background: #f3f4f6; }
.jobmager-toast {
  position: fixed;
  z-index: 2147483647;
  right: 16px;
  bottom: 16px;
  font: 500 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #f9fafb;
  background: #111827;
  border-radius: 10px;
  padding: 10px 14px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, .3);
  max-width: 320px;
}
`;

export function injectStyles(doc: Document = document) {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  (doc.head ?? doc.documentElement).appendChild(style);
}

export function markFilled(el: HTMLElement) {
  el.classList.remove('jobmager-empty');
  el.classList.add('jobmager-filled');
}

export function markEmpty(el: HTMLElement) {
  el.classList.remove('jobmager-filled');
  el.classList.add('jobmager-empty');
}

export function clearHighlights(doc: Document = document) {
  doc.querySelectorAll('.jobmager-filled, .jobmager-empty').forEach((el) => {
    el.classList.remove('jobmager-filled', 'jobmager-empty');
  });
}

export function toast(message: string, ms = 4000) {
  injectStyles();
  const node = document.createElement('div');
  node.className = 'jobmager-toast';
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), ms);
}
