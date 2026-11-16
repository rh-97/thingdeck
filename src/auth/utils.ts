/** Token scopes ThingsDeck needs for every screen to work. */
export const SCOPES = [
  'r:devices:*',
  'x:devices:*',
  'r:locations:*',
  'x:locations:*',
  'r:scenes:*',
  'x:scenes:*',
  'r:rules:*',
  'w:rules:*',
];

/** Only allow same-site relative paths after sign-in, to avoid open redirects. */
export function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
