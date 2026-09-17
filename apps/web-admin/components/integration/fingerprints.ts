/**
 * Certificate-fingerprint parsing for federation mTLS configuration.
 *
 * Operators paste fingerprints copied from a variety of tools, so the input may be
 * whitespace- or comma-separated and may carry the colon-grouped formatting that OpenSSL
 * prints. Normalisation happens here rather than in the dialog so the rules are testable in
 * isolation and cannot drift between the create and edit paths.
 */

/** Splits pasted input into a de-duplicated list, preserving the operator's original casing. */
export function parseFingerprints(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/** A SHA-256 fingerprint is 64 hex characters once the colon grouping is stripped. */
export function isSha256Fingerprint(value: string): boolean {
  return /^[a-f0-9]{64}$/i.test(value.replaceAll(':', ''));
}
