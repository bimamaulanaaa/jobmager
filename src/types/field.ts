/** Shapes shared between the content script's scanner and the AI matcher. */

export type FieldKind =
  | 'text'
  | 'textarea'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'contenteditable';

export interface FieldOption {
  /** Value to submit (option value, radio value, or the label as fallback). */
  value: string;
  /** Human-readable text the AI reasons about. */
  label: string;
}

/**
 * A single fillable field, described only by what is observable in the DOM.
 * No site-specific knowledge: the AI reads these descriptors, not selectors.
 */
export interface FieldDescriptor {
  /** Stable within one scan; used as the key of the AI's JSON response. */
  id: string;
  kind: FieldKind;
  /** input[type] for text-ish fields (email, tel, date, number, url...). */
  inputType?: string;
  label?: string;
  placeholder?: string;
  name?: string;
  domId?: string;
  ariaLabel?: string;
  /** Text found around the field when no proper label exists. */
  nearbyText?: string;
  required?: boolean;
  maxLength?: number;
  /** Present for select / radio / checkbox groups. Values are authoritative. */
  options?: FieldOption[];
  /** True when several checkboxes share a group and multiple picks are valid. */
  multiple?: boolean;
  currentValue?: string;
}

/** What the AI produced for one field, after validation. */
export interface FieldMatch {
  fieldId: string;
  value: string | null;
  /** Set when a proposed value was dropped by the validator. */
  rejected?: string;
}

export interface AutofillStats {
  total: number;
  filled: number;
  empty: number;
  rejected: number;
}
