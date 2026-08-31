export const NOTEBOOK_TINTS = [
  "183, 142, 65",
  "166, 91, 98",
  "86, 139, 111",
  "74, 132, 163",
  "119, 91, 153",
  "105, 114, 123",
] as const;

export function notebookTint(id: string): string {
  const hash = [...id].reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) >>> 0,
    0,
  );
  return NOTEBOOK_TINTS[hash % NOTEBOOK_TINTS.length]!;
}
