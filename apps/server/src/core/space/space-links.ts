export const SPACE_LINK_PROVIDERS = [
  'sharepoint',
  'linear',
  'trylle',
  'busy',
] as const;

export type SpaceLinkProvider = (typeof SPACE_LINK_PROVIDERS)[number];

/** Marathon project id: up to four letters (incl. Æ Ø Å) followed by four digits. */
export const PROJECT_ID_PATTERN = /^[A-ZÆØÅ]{0,4}\d{4}$/;

/**
 * Canonicalises user input such as "lære 0001" to "LÆRE0001".
 * Busy displays the id with a space, Marathon stores it without.
 */
export function normalizeProjectId(value: string): string {
  return value.replace(/\s+/g, '').toLocaleUpperCase('nb-NO');
}

export function isValidProjectId(value: string): boolean {
  return PROJECT_ID_PATTERN.test(value);
}

/** Providers that are only identified by the project id and need no URL. */
export const PROJECT_ID_ONLY_PROVIDERS: SpaceLinkProvider[] = ['trylle', 'busy'];
