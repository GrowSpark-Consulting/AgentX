/** "real-estate" → "Real estate". Displays a pack or plan key; never branch on it. */
export function packLabel(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
