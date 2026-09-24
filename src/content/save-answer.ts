import type { FieldDescriptor } from '@/types/field';
import { injectStyles } from './highlight';

/**
 * Watches the fields autofill could not fill. When the user answers one by
 * hand, offers to remember it so the next application matches it automatically.
 */

interface Watched {
  descriptor: FieldDescriptor;
  element: HTMLElement;
  initialValue: string;
}

const watched = new Map<HTMLElement, Watched>();
let listenersAttached = false;
let activePrompt: HTMLElement | null = null;

/** The question we store: whatever the page called this field. */
export function questionFor(descriptor: FieldDescriptor): string {
  return (
    descriptor.label ||
    descriptor.ariaLabel ||
    descriptor.placeholder ||
    descriptor.nearbyText ||
    descriptor.name ||
    descriptor.domId ||
    'Untitled question'
  ).slice(0, 300);
}

function currentValue(el: HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value.trim();
  if (el instanceof HTMLSelectElement) {
    return (el.selectedOptions[0]?.textContent ?? el.value).trim();
  }
  return (el.textContent ?? '').trim();
}

function dismissPrompt() {
  activePrompt?.remove();
  activePrompt = null;
}

function showPrompt(entry: Watched, answer: string) {
  dismissPrompt();
  injectStyles();

  const rect = entry.element.getBoundingClientRect();
  const node = document.createElement('div');
  node.className = 'jobmager-prompt';
  node.setAttribute('data-jobmager-ui', 'true');

  const text = document.createElement('span');
  text.textContent = 'Save this answer?';

  const yes = document.createElement('button');
  yes.className = 'jm-yes';
  yes.type = 'button';
  yes.textContent = 'Save';

  const no = document.createElement('button');
  no.className = 'jm-no';
  no.type = 'button';
  no.textContent = 'Not now';

  node.append(text, yes, no);
  document.body.appendChild(node);

  const top = window.scrollY + rect.bottom + 6;
  const left = Math.min(
    window.scrollX + rect.left,
    window.scrollX + document.documentElement.clientWidth - node.offsetWidth - 12,
  );
  node.style.top = `${top}px`;
  node.style.left = `${Math.max(8, left)}px`;

  activePrompt = node;

  yes.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'SAVE_ANSWER',
      question: questionFor(entry.descriptor),
      answer,
      origin: location.hostname,
    });
    text.textContent = 'Saved';
    yes.remove();
    no.textContent = 'Close';
    setTimeout(dismissPrompt, 1200);
    // Do not offer again for this field in this session.
    watched.delete(entry.element);
  });

  no.addEventListener('click', () => {
    dismissPrompt();
    watched.delete(entry.element);
  });
}

function onBlur(event: Event) {
  const target = event.target as HTMLElement | null;
  if (!target) return;
  const entry = watched.get(target);
  if (!entry) return;

  const value = currentValue(target);
  if (!value || value === entry.initialValue) return;
  if (value.length > 2000) return;

  showPrompt(entry, value);
}

function onDocumentClick(event: Event) {
  if (!activePrompt) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.jobmager-prompt')) return;
  dismissPrompt();
}

/** Called after each autofill pass with the fields that stayed empty. */
export function watchEmptyFields(entries: { descriptor: FieldDescriptor; element: HTMLElement }[]) {
  for (const entry of entries) {
    watched.set(entry.element, {
      descriptor: entry.descriptor,
      element: entry.element,
      initialValue: currentValue(entry.element),
    });
  }

  if (listenersAttached) return;
  // Capture phase: some forms stop propagation of blur on their own inputs.
  document.addEventListener('blur', onBlur, true);
  document.addEventListener('change', onBlur, true);
  document.addEventListener('click', onDocumentClick, true);
  window.addEventListener('scroll', dismissPrompt, true);
  listenersAttached = true;
}

export function stopWatching() {
  watched.clear();
  dismissPrompt();
}
