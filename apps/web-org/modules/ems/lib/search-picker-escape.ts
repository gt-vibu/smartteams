/** Radix handles Escape at document capture, before the picker sees the key. */
export function preserveDialogForPicker(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.closest('[data-search-picker-open="true"]'))
    event.preventDefault();
}
