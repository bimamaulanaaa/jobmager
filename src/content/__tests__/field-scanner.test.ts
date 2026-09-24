/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest';
import { scanAll } from '../field-scanner';

/**
 * jsdom reports every element as unlaid-out, so the visibility check would drop
 * everything. These stubs give elements a box unless the test hides them.
 */
function stubLayout() {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      // jsdom does not propagate display:none to descendants; walk it manually.
      let node: HTMLElement | null = this;
      while (node) {
        if (getComputedStyle(node).display === 'none') return null;
        node = node.parentElement;
      }
      return this.parentElement;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function () {
    const hidden = this.offsetParent === null || getComputedStyle(this).visibility === 'hidden';
    return { width: hidden ? 0 : 160, height: hidden ? 0 : 32, top: 0, left: 0,
      right: 160, bottom: 32, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
  };
}

function render(html: string) {
  document.body.innerHTML = html;
  return scanAll();
}

const byLabel = (fields: ReturnType<typeof scanAll>, label: string) =>
  fields.find((f) => (f.descriptor.label ?? '').includes(label));

beforeEach(stubLayout);

describe('label resolution', () => {
  it('reads a label bound with for=', () => {
    const fields = render(`
      <label for="em">Email address</label><input id="em" type="email" name="email">
    `);
    expect(fields[0].descriptor.label).toBe('Email address');
    expect(fields[0].descriptor.inputType).toBe('email');
  });

  it('reads a wrapping label', () => {
    const fields = render(`<label>Phone number <input name="phone"></label>`);
    expect(fields[0].descriptor.label).toBe('Phone number');
  });

  it('reads aria-labelledby', () => {
    const fields = render(`
      <span id="q1">What is your notice period?</span>
      <input aria-labelledby="q1" name="notice">
    `);
    expect(fields[0].descriptor.label).toBe('What is your notice period?');
  });

  it('falls back to aria-label and placeholder', () => {
    const fields = render(`<input aria-label="LinkedIn URL" placeholder="https://" name="li">`);
    expect(fields[0].descriptor.ariaLabel).toBe('LinkedIn URL');
    expect(fields[0].descriptor.placeholder).toBe('https://');
  });

  it('falls back to nearby text when a custom form has no label element', () => {
    const fields = render(`
      <div class="row"><div class="q">Preferred start date</div><input name="x1"></div>
    `);
    const text = `${fields[0].descriptor.label ?? ''}${fields[0].descriptor.nearbyText ?? ''}`;
    expect(text).toContain('Preferred start date');
  });
});

describe('field kinds and options', () => {
  it('collects select options and drops the placeholder row', () => {
    const fields = render(`
      <label for="c">Country</label>
      <select id="c" name="country">
        <option value="">Select…</option>
        <option value="uk">United Kingdom</option>
        <option value="us">United States</option>
      </select>
    `);
    const select = byLabel(fields, 'Country')!;
    expect(select.descriptor.kind).toBe('select');
    expect(select.descriptor.options?.map((o) => o.value)).toEqual(['uk', 'us']);
  });

  it('groups radios into one field with the fieldset legend as the question', () => {
    const fields = render(`
      <fieldset>
        <legend>Do you require visa sponsorship?</legend>
        <label><input type="radio" name="spon" value="yes"> Yes</label>
        <label><input type="radio" name="spon" value="no"> No</label>
      </fieldset>
    `);
    expect(fields).toHaveLength(1);
    expect(fields[0].descriptor.kind).toBe('radio');
    expect(fields[0].descriptor.label).toBe('Do you require visa sponsorship?');
    expect(fields[0].descriptor.options).toEqual([
      { value: 'yes', label: 'Yes' },
      { value: 'no', label: 'No' },
    ]);
    expect(fields[0].elements).toHaveLength(2);
  });

  it('treats a checkbox group as multi-select and a lone checkbox as a toggle', () => {
    const group = render(`
      <fieldset><legend>Languages</legend>
        <label><input type="checkbox" name="lang" value="go"> Go</label>
        <label><input type="checkbox" name="lang" value="py"> Python</label>
      </fieldset>
    `);
    expect(group[0].descriptor.multiple).toBe(true);

    const single = render(`<label><input type="checkbox" name="tos"> I agree</label>`);
    expect(single[0].descriptor.multiple).toBeFalsy();
    expect(single[0].descriptor.options?.map((o) => o.value)).toEqual(['yes', 'no']);
  });

  it('picks up textareas and contenteditable fields', () => {
    const fields = render(`
      <label for="cl">Cover letter</label><textarea id="cl" maxlength="500"></textarea>
      <div>Why this role?</div><div contenteditable="true" role="textbox"></div>
    `);
    expect(fields[0].descriptor.kind).toBe('textarea');
    expect(fields[0].descriptor.maxLength).toBe(500);
    expect(fields[1].descriptor.kind).toBe('contenteditable');
  });
});

describe('what the scanner refuses to touch', () => {
  it('skips hidden, disabled, readonly, file, password and submit inputs', () => {
    const fields = render(`
      <input type="hidden" name="csrf">
      <input type="submit" value="Apply">
      <input type="file" name="resume">
      <input type="password" name="pw">
      <input name="disabled" disabled>
      <input name="readonly" readonly>
      <div style="display:none"><input name="hiddenParent"></div>
      <input name="real">
    `);
    expect(fields).toHaveLength(1);
    expect(fields[0].descriptor.name).toBe('real');
  });

  it('gives every field a unique id', () => {
    const fields = render(`
      <input name="a"><input name="b"><input name="c">
    `);
    expect(new Set(fields.map((f) => f.descriptor.id)).size).toBe(3);
  });
});
