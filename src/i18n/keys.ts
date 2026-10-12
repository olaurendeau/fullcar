type Messages = { [key: string]: string | Messages };

/** Every leaf key of a messages file, dotted: `Home.title`. */
export function flattenKeys(messages: Messages, prefix = ""): string[] {
  return Object.entries(messages).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : flattenKeys(value, path);
  });
}

/** Keys present in one locale and not the other, and empty translations. */
export function diffMessages(
  reference: Messages,
  other: Messages,
): { missing: string[]; extra: string[]; empty: string[] } {
  const ref = new Set(flattenKeys(reference));
  const oth = new Set(flattenKeys(other));
  const empty = [...oth].filter((key) => {
    const value = key.split(".").reduce<unknown>((node, part) => (node as Messages)[part], other);
    return typeof value === "string" && value.trim() === "";
  });
  return {
    missing: [...ref].filter((key) => !oth.has(key)),
    extra: [...oth].filter((key) => !ref.has(key)),
    empty,
  };
}
