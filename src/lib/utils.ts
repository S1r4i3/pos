/** Join class names, skipping empty ones: cn("a", cond && "b") */
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/** Make a short uppercase code from a name: "Banjara Hills" → "BH" */
export function suggestCode(name: string) {
  const words = name.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const code = words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join("").slice(0, 4);
  return code;
}
