export interface FlagRow {
  type: string; // 'static' | 'static_ci' | 'regex'
  content: string;
}

// Check a submitted value against a challenge's accepted flags.
export function checkFlag(submitted: string, flags: FlagRow[]): boolean {
  const value = submitted.trim();
  for (const flag of flags) {
    if (flag.type === "regex") {
      try {
        if (new RegExp(flag.content).test(value)) return true;
      } catch {
        // ignore malformed regex
      }
    } else if (flag.type === "static_ci") {
      if (value.toLowerCase() === flag.content.trim().toLowerCase()) return true;
    } else {
      if (value === flag.content.trim()) return true;
    }
  }
  return false;
}

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
