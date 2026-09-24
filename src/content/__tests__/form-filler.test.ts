/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fillFields } from '../form-filler';
import type { ScannedField } from '../field-scanner';
import type { FieldDescriptor } from '@/types/field';

function field(descriptor: FieldDescriptor, elements: HTMLElement[]): ScannedField {
  return { descriptor, elements };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('text fields', () => {
  it('sets the value and dispatches input and change', () => {
    document.body.innerHTML = `<input id="a">`;
    const input = document.getElementById('a') as HTMLInputElement;
    const seen: string[] = [];
    for (const type of ['input', 'change', 'focusin', 'focusout']) {
      input.addEventListener(type, () => seen.push(type));
    }

    const [outcome] = fillFields(
      [field({ id: 'f1', kind: 'text' }, [input])],
      [{ fieldId: 'f1', value: 'Ada Lovelace' }],
    );

    expect(input.value).toBe('Ada Lovelace');
    expect(outcome.filled).toBe(true);
    expect(seen).toEqual(['focusin', 'input', 'change', 'focusout']);
  });

  it('goes through the native prototype setter so framework trackers update', () => {
    document.body.innerHTML = `<input id="a">`;
    const input = document.getElementById('a') as HTMLInputElement;
    // React installs its own setter on the instance; the native one lives on
    // the prototype. Patching the prototype setter proves the filler routes
    // through it rather than assigning to the instance property.
    const original = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
    const spy = vi.fn(function (this: HTMLInputElement, v: string) {
      original.set!.call(this, v);
    });
    Object.defineProperty(HTMLInputElement.prototype, 'value', { ...original, set: spy });

    // A stale instance-level setter, exactly as a framework would leave it.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: () => 'stale',
      set: () => { throw new Error('the instance setter must not be used'); },
    });

    try {
      fillFields([field({ id: 'f1', kind: 'text' }, [input])], [{ fieldId: 'f1', value: 'hi' }]);
      expect(spy).toHaveBeenCalledWith('hi');
    } finally {
      delete (input as unknown as Record<string, unknown>).value;
      Object.defineProperty(HTMLInputElement.prototype, 'value', original);
    }
  });

  it('truncates to maxlength rather than failing', () => {
    document.body.innerHTML = `<input id="a" maxlength="4">`;
    const input = document.getElementById('a') as HTMLInputElement;
    fillFields([field({ id: 'f1', kind: 'text' }, [input])], [{ fieldId: 'f1', value: 'abcdefgh' }]);
    expect(input.value).toBe('abcd');
  });

  it('leaves the field alone when the value is null', () => {
    document.body.innerHTML = `<input id="a" value="keep">`;
    const input = document.getElementById('a') as HTMLInputElement;
    const [outcome] = fillFields(
      [field({ id: 'f1', kind: 'text' }, [input])],
      [{ fieldId: 'f1', value: null }],
    );
    expect(input.value).toBe('keep');
    expect(outcome.filled).toBe(false);
  });
});

describe('selects', () => {
  const markup = `
    <select id="s">
      <option value="">Select…</option>
      <option value="uk">United Kingdom</option>
      <option value="us">United States</option>
    </select>`;

  it('selects by option value', () => {
    document.body.innerHTML = markup;
    const select = document.getElementById('s') as HTMLSelectElement;
    fillFields([field({ id: 'f1', kind: 'select' }, [select])], [{ fieldId: 'f1', value: 'uk' }]);
    expect(select.value).toBe('uk');
  });

  it('selects by visible label', () => {
    document.body.innerHTML = markup;
    const select = document.getElementById('s') as HTMLSelectElement;
    fillFields(
      [field({ id: 'f1', kind: 'select' }, [select])],
      [{ fieldId: 'f1', value: 'United States' }],
    );
    expect(select.value).toBe('us');
  });

  it('reports a failure instead of inventing an option', () => {
    document.body.innerHTML = markup;
    const select = document.getElementById('s') as HTMLSelectElement;
    const [outcome] = fillFields(
      [field({ id: 'f1', kind: 'select' }, [select])],
      [{ fieldId: 'f1', value: 'Atlantis' }],
    );
    expect(outcome.filled).toBe(false);
    expect(select.value).toBe('');
  });
});

describe('radios and checkboxes', () => {
  it('clicks the matching radio so framework handlers run', () => {
    document.body.innerHTML = `
      <input type="radio" name="s" value="yes" id="y">
      <input type="radio" name="s" value="no" id="n">`;
    const yes = document.getElementById('y') as HTMLInputElement;
    const no = document.getElementById('n') as HTMLInputElement;
    const clicks: string[] = [];
    no.addEventListener('click', () => clicks.push('no'));

    fillFields(
      [field({ id: 'f1', kind: 'radio', options: [
        { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' },
      ] }, [yes, no])],
      [{ fieldId: 'f1', value: 'no' }],
    );

    expect(no.checked).toBe(true);
    expect(yes.checked).toBe(false);
    expect(clicks).toEqual(['no']);
  });

  it('ticks several boxes in a multi-select group', () => {
    document.body.innerHTML = `
      <input type="checkbox" name="l" value="go" id="go">
      <input type="checkbox" name="l" value="py" id="py">
      <input type="checkbox" name="l" value="rs" id="rs">`;
    const boxes = ['go', 'py', 'rs'].map((id) => document.getElementById(id) as HTMLInputElement);

    fillFields(
      [field({ id: 'f1', kind: 'checkbox', multiple: true, options: [] }, boxes)],
      [{ fieldId: 'f1', value: 'go,rs' }],
    );

    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
  });

  it('treats a lone checkbox as a yes/no toggle', () => {
    document.body.innerHTML = `<input type="checkbox" id="t">`;
    const box = document.getElementById('t') as HTMLInputElement;
    fillFields([field({ id: 'f1', kind: 'checkbox' }, [box])], [{ fieldId: 'f1', value: 'yes' }]);
    expect(box.checked).toBe(true);
    fillFields([field({ id: 'f1', kind: 'checkbox' }, [box])], [{ fieldId: 'f1', value: 'no' }]);
    expect(box.checked).toBe(false);
  });
});

describe('contenteditable', () => {
  it('writes text and dispatches an InputEvent', () => {
    document.body.innerHTML = `<div id="c" contenteditable="true"></div>`;
    const el = document.getElementById('c') as HTMLElement;
    let inputEvent: Event | null = null;
    el.addEventListener('input', (e) => { inputEvent = e; });

    const [outcome] = fillFields(
      [field({ id: 'f1', kind: 'contenteditable' }, [el])],
      [{ fieldId: 'f1', value: 'Some prose' }],
    );

    expect(el.textContent).toBe('Some prose');
    expect(outcome.filled).toBe(true);
    expect(inputEvent).toBeInstanceOf(InputEvent);
  });
});

describe('resilience', () => {
  it('ignores matches for fields that left the DOM', () => {
    const detached = document.createElement('input');
    const outcomes = fillFields(
      [field({ id: 'f1', kind: 'text' }, [detached])],
      [{ fieldId: 'f1', value: 'x' }],
    );
    expect(outcomes).toHaveLength(0);
  });

  it('ignores ids the scanner never produced', () => {
    const outcomes = fillFields([], [{ fieldId: 'ghost', value: 'x' }]);
    expect(outcomes).toHaveLength(0);
  });
});
