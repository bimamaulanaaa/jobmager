import type { FieldMatch } from '@/types/field';
import type { ScannedField } from './field-scanner';

/**
 * Writing to `.value` directly is invisible to React/Vue/Angular: their
 * controlled inputs read from an internal value tracker. Going through the
 * native prototype setter and then dispatching the events the framework
 * listens for is what makes the value stick.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = Object.getPrototypeOf(el);
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor?.set) descriptor.set.call(el, value);
  else el.value = value;
}

function fireInputEvents(el: HTMLElement) {
  el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
}

function focusAndBlur(el: HTMLElement, write: () => void) {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
  el.dispatchEvent(new Event('focusin', { bubbles: true }));
  write();
  el.dispatchEvent(new Event('blur', { bubbles: false }));
  el.dispatchEvent(new Event('focusout', { bubbles: true }));
}

function fillText(el: HTMLInputElement | HTMLTextAreaElement, value: string): boolean {
  if (el.maxLength > 0 && value.length > el.maxLength) value = value.slice(0, el.maxLength);
  focusAndBlur(el, () => {
    setNativeValue(el, value);
    fireInputEvents(el);
    // Some autocomplete widgets only react to key events.
    el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }));
  });
  return el.value === value;
}

function fillSelect(el: HTMLSelectElement, value: string): boolean {
  const wanted = value.toLowerCase().trim();
  const match =
    Array.from(el.options).find((o) => o.value === value) ??
    Array.from(el.options).find((o) => o.value.toLowerCase().trim() === wanted) ??
    Array.from(el.options).find((o) => (o.textContent ?? '').toLowerCase().trim() === wanted);
  if (!match) return false;
  focusAndBlur(el, () => {
    setNativeValue(el, match.value);
    fireInputEvents(el);
  });
  return el.value === match.value;
}

function fillChoice(inputs: HTMLInputElement[], value: string, multiple: boolean): boolean {
  const wanted = new Set(
    (multiple ? value.split(',') : [value]).map((v) => v.toLowerCase().trim()).filter(Boolean),
  );

  // A lone checkbox is a yes/no toggle rather than a pick from a list.
  if (inputs.length === 1 && inputs[0].type === 'checkbox') {
    const shouldCheck = /^(yes|true|y|on|checked)$/i.test(value.trim());
    const box = inputs[0];
    if (box.checked !== shouldCheck) box.click();
    return box.checked === shouldCheck;
  }

  let hit = false;
  for (const input of inputs) {
    const label = (input.labels?.[0]?.textContent ?? '').toLowerCase().trim();
    const isWanted =
      wanted.has(input.value.toLowerCase().trim()) || (label ? wanted.has(label) : false);
    if (!isWanted) continue;
    // click() drives the framework's own handler, unlike setting `checked`.
    if (!input.checked) input.click();
    if (input.checked) hit = true;
  }
  return hit;
}

function fillContentEditable(el: HTMLElement, value: string): boolean {
  el.focus();
  const range = el.ownerDocument.createRange();
  range.selectNodeContents(el);
  const selection = el.ownerDocument.defaultView?.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  el.textContent = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, data: value }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.blur();
  return (el.textContent ?? '').trim() === value.trim();
}

export interface FillOutcome {
  fieldId: string;
  filled: boolean;
  /** The element to highlight (the first of a group). */
  element: HTMLElement;
  value: string | null;
  reason?: string;
}

export function fillFields(fields: ScannedField[], matches: FieldMatch[]): FillOutcome[] {
  const byId = new Map(fields.map((f) => [f.descriptor.id, f]));
  const outcomes: FillOutcome[] = [];

  for (const match of matches) {
    const field = byId.get(match.fieldId);
    if (!field) continue;
    const [first] = field.elements;
    if (!first?.isConnected) continue;

    if (match.value === null) {
      outcomes.push({
        fieldId: match.fieldId,
        filled: false,
        element: first,
        value: null,
        reason: match.rejected,
      });
      continue;
    }

    let filled = false;
    try {
      switch (field.descriptor.kind) {
        case 'text':
          filled = fillText(first as HTMLInputElement, match.value);
          break;
        case 'textarea':
          filled = fillText(first as HTMLTextAreaElement, match.value);
          break;
        case 'select':
          filled = fillSelect(first as HTMLSelectElement, match.value);
          break;
        case 'radio':
        case 'checkbox':
          filled = fillChoice(
            field.elements as HTMLInputElement[],
            match.value,
            field.descriptor.multiple === true,
          );
          break;
        case 'contenteditable':
          filled = fillContentEditable(first, match.value);
          break;
      }
    } catch {
      filled = false;
    }

    outcomes.push({
      fieldId: match.fieldId,
      filled,
      element: first,
      value: match.value,
      reason: filled ? undefined : 'the page rejected the value',
    });
  }

  return outcomes;
}
