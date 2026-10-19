const ACRONYMS = new Set(["acl", "hcp", "msl", "mrna"]);

/** "sports-medicine" -> "Sports medicine", "hcp-engagement" -> "HCP engagement" */
export function formatCategory(category: string): string {
  const sentence = category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => (ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.toLowerCase()))
    .join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
