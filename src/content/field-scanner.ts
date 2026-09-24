import type { FieldDescriptor, FieldKind, FieldOption } from '@/types/field';

/**
 * Describes every fillable field on the page using nothing but the DOM.
 * There are no site-specific selectors anywhere in here on purpose: the page's
 * own labels, ARIA attributes and surrounding text are the only signal.
 */

const SKIPPED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'file', 'password', 'range', 'color',
]);

/** Marks the element so the filler can find it again after the AI responds. */
const REF_ATTR = 'data-jobmager-id';

export interface ScannedField {
  descriptor: FieldDescriptor;
  /** For radio/checkbox groups this holds every member of the group. */
  elements: HTMLElement[];
}

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return false;
  // A zero-size ancestor hides the field even when the field itself has a box.
  if (!el.offsetParent && style.position !== 'fixed') return false;
  return true;
}

function isFillable(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return false;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.readOnly) return false;
  }
  if (el instanceof HTMLInputElement && SKIPPED_INPUT_TYPES.has(el.type)) return false;
  return isVisible(el);
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
}

function textOf(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('input,select,textarea,button,script,style').forEach((n) => n.remove());
  return cleanText(clone.textContent);
}

/** Label resolution, most reliable source first. */
function findLabel(el: HTMLElement): string {
  const id = el.getAttribute('id');
  if (id) {
    const escaped = CSS.escape(id);
    const explicit = el.ownerDocument.querySelector(`label[for="${escaped}"]`);
    const text = textOf(explicit);
    if (text) return text;
  }

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((ref) => textOf(el.ownerDocument.getElementById(ref)))
      .filter(Boolean)
      .join(' ');
    if (text) return cleanText(text);
  }

  const wrapping = el.closest('label');
  if (wrapping) {
    const text = textOf(wrapping);
    if (text) return text;
  }

  return '';
}

/**
 * Text from an element that is plausibly a label. An element that contains form
 * controls is a layout wrapper, not a question, so its text is discarded — it
 * would otherwise drag a whole section of the form into the field's context.
 */
function labelishText(el: Element | null): string {
  if (!el) return '';
  if (el.querySelector('input:not([type="hidden"]), select, textarea, [contenteditable="true"]')) {
    return '';
  }
  return textOf(el);
}

/** Last resort: readable text sitting immediately before or above the field. */
function findNearbyText(el: HTMLElement): string {
  const chunks: string[] = [];

  let node: Element | null = el.previousElementSibling;
  let hops = 0;
  while (node && hops < 3) {
    const text = labelishText(node);
    if (text && text.length < 200) chunks.push(text);
    node = node.previousElementSibling;
    hops++;
  }

  let parent: HTMLElement | null = el.parentElement;
  let depth = 0;
  while (parent && depth < 3 && chunks.join(' ').length < 120) {
    // The question is frequently a sibling of the field's wrapper rather than
    // of the field, e.g. <div class="q">Question</div><div><input></div>.
    const prior = labelishText(parent.previousElementSibling);
    if (prior && prior.length < 200) chunks.push(prior);

    const legend = parent.querySelector('legend, h1, h2, h3, h4, h5, h6');
    if (legend) {
      const text = textOf(legend);
      if (text) chunks.push(text);
    }
    // Direct text nodes of the wrapper often hold the question on custom forms.
    const own = Array.from(parent.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => cleanText(n.textContent))
      .filter((t) => t.length > 1)
      .join(' ');
    if (own) chunks.push(own);
    parent = parent.parentElement;
    depth++;
  }

  return cleanText(Array.from(new Set(chunks)).join(' | ')).slice(0, 220);
}

function optionsOfSelect(select: HTMLSelectElement): FieldOption[] {
  return Array.from(select.options)
    .filter((opt) => !opt.disabled)
    .map((opt) => ({ value: opt.value, label: cleanText(opt.textContent) || opt.value }))
    // Placeholder rows ("Select...") are not real choices.
    .filter((opt) => opt.value !== '' || /select|choose|--/i.test(opt.label) === false);
}

function labelForChoice(input: HTMLInputElement): string {
  const own = findLabel(input);
  if (own) return own;
  const next = input.nextElementSibling;
  const text = textOf(next);
  if (text) return text;
  return cleanText(input.value);
}

/** The question text shared by a radio/checkbox group. */
function groupQuestion(inputs: HTMLInputElement[]): string {
  const fieldset = inputs[0].closest('fieldset');
  if (fieldset) {
    // A legend is only this group's question when the fieldset wraps the group
    // and nothing else. A fieldset holding other fields is a section heading,
    // and using it would hand the matcher the wrong question.
    const inside = fieldset.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
    if (inside <= inputs.length) {
      const legend = textOf(fieldset.querySelector('legend'));
      if (legend) return legend;
    }
  }
  const group = inputs[0].closest('[role="radiogroup"], [role="group"]');
  if (group) {
    const labelled = group.getAttribute('aria-label') ?? '';
    if (labelled) return cleanText(labelled);
    const by = group.getAttribute('aria-labelledby');
    if (by) {
      const text = by
        .split(/\s+/)
        .map((ref) => textOf(inputs[0].ownerDocument.getElementById(ref)))
        .join(' ');
      if (cleanText(text)) return cleanText(text);
    }
  }
  // Fall back to whatever sits above the group as a whole. Searching from a
  // single option would pick up that option's own text ("Go"), which is an
  // answer, not the question.
  const container = commonAncestor(inputs);
  if (container) {
    const firstInputIndex = Array.from(container.children).findIndex((child) =>
      inputs.some((input) => child.contains(input)),
    );
    // Text that appears before the first option inside the group's container.
    for (let i = firstInputIndex - 1; i >= 0; i--) {
      const text = labelishText(container.children[i]);
      if (text && text.length < 200) return text;
    }
    const prior = labelishText(container.previousElementSibling);
    if (prior && prior.length < 200) return prior;
    return findNearbyText(container);
  }
  return findNearbyText(inputs[0]);
}

/** Closest element containing every member of a radio/checkbox group. */
function commonAncestor(elements: HTMLElement[]): HTMLElement | null {
  let node: HTMLElement | null = elements[0]?.parentElement ?? null;
  while (node) {
    if (elements.every((el) => node!.contains(el))) return node;
    node = node.parentElement;
  }
  return null;
}

function kindOf(el: HTMLElement): FieldKind | null {
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement) {
    if (el.type === 'radio') return 'radio';
    if (el.type === 'checkbox') return 'checkbox';
    return 'text';
  }
  // The attribute is checked alongside the property: isContentEditable is not
  // populated in every context (detached trees, non-rendering engines).
  const editable = el.getAttribute('contenteditable');
  if (el.isContentEditable || editable === 'true' || editable === '') return 'contenteditable';
  return null;
}

export function scanFields(root: Document | ShadowRoot = document): ScannedField[] {
  const fields: ScannedField[] = [];
  let counter = 0;
  const nextId = () => `f${++counter}`;

  const candidates = Array.from(
    root.querySelectorAll<HTMLElement>(
      'input, textarea, select, [contenteditable="true"], [contenteditable=""]',
    ),
  ).filter(isFillable);

  const consumed = new Set<HTMLElement>();

  for (const el of candidates) {
    if (consumed.has(el)) continue;
    const kind = kindOf(el);
    if (!kind) continue;

    el.removeAttribute(REF_ATTR);

    // --- radio & checkbox groups -------------------------------------------
    if (kind === 'radio' || kind === 'checkbox') {
      const input = el as HTMLInputElement;
      const name = input.name;
      let group: HTMLInputElement[] = [input];
      if (name) {
        group = candidates.filter(
          (c): c is HTMLInputElement =>
            c instanceof HTMLInputElement && c.type === input.type && c.name === name,
        );
      }
      group.forEach((g) => consumed.add(g));

      const options: FieldOption[] =
        kind === 'radio' || group.length > 1
          ? group.map((g) => ({ value: g.value || labelForChoice(g), label: labelForChoice(g) }))
          : [
              { value: 'yes', label: 'Yes / checked' },
              { value: 'no', label: 'No / unchecked' },
            ];

      const question = group.length > 1 ? groupQuestion(group) : findLabel(input) || findNearbyText(input);
      const id = nextId();
      group.forEach((g, i) => g.setAttribute(REF_ATTR, `${id}:${i}`));

      fields.push({
        descriptor: {
          id,
          kind,
          label: question || undefined,
          name: name || undefined,
          domId: input.id || undefined,
          ariaLabel: cleanText(input.getAttribute('aria-label')) || undefined,
          nearbyText: question ? undefined : findNearbyText(input),
          required: input.required || input.getAttribute('aria-required') === 'true',
          options,
          multiple: kind === 'checkbox' && group.length > 1,
          currentValue: group.filter((g) => g.checked).map((g) => g.value).join(',') || undefined,
        },
        elements: group,
      });
      continue;
    }

    // --- everything else ----------------------------------------------------
    const id = nextId();
    el.setAttribute(REF_ATTR, id);
    consumed.add(el);

    const label = findLabel(el);
    const descriptor: FieldDescriptor = {
      id,
      kind,
      label: label || undefined,
      name: (el as HTMLInputElement).name || undefined,
      domId: el.id || undefined,
      ariaLabel: cleanText(el.getAttribute('aria-label')) || undefined,
      placeholder: cleanText(el.getAttribute('placeholder')) || undefined,
      nearbyText: label ? undefined : findNearbyText(el),
      required:
        (el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true' || undefined,
    };

    if (el instanceof HTMLInputElement) {
      descriptor.inputType = el.type;
      if (el.maxLength > 0) descriptor.maxLength = el.maxLength;
      descriptor.currentValue = el.value || undefined;
      // Native datalist suggestions are real options.
      if (el.list instanceof HTMLDataListElement) {
        descriptor.options = Array.from(el.list.options).map((o) => ({
          value: o.value,
          label: cleanText(o.label) || o.value,
        }));
      }
    } else if (el instanceof HTMLTextAreaElement) {
      if (el.maxLength > 0) descriptor.maxLength = el.maxLength;
      descriptor.currentValue = el.value || undefined;
    } else if (el instanceof HTMLSelectElement) {
      descriptor.options = optionsOfSelect(el);
      descriptor.multiple = el.multiple || undefined;
      descriptor.currentValue = el.value || undefined;
      if (!descriptor.options.length) continue;
    } else {
      descriptor.currentValue = cleanText(el.textContent) || undefined;
    }

    fields.push({ descriptor, elements: [el] });
  }

  return fields;
}

/** Also walks open shadow roots, which some design systems use for inputs. */
export function scanAll(): ScannedField[] {
  const found = scanFields(document);
  const shadowHosts = Array.from(document.querySelectorAll<HTMLElement>('*')).filter(
    (el) => el.shadowRoot,
  );
  if (!shadowHosts.length) return found;

  let offset = found.length;
  for (const host of shadowHosts) {
    const inner = scanFields(host.shadowRoot!);
    for (const field of inner) {
      // Re-key so ids stay unique across roots.
      const newId = `s${++offset}`;
      field.elements.forEach((el, i) => {
        const current = el.getAttribute(REF_ATTR) ?? '';
        el.setAttribute(REF_ATTR, current.includes(':') ? `${newId}:${i}` : newId);
      });
      field.descriptor.id = newId;
      found.push(field);
    }
  }
  return found;
}

export { REF_ATTR };
