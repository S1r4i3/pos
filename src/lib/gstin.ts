// GSTIN = 2-digit state code + 10-char PAN + entity no. + 'Z' + check character.
// Example: 27AAPFU0939F1ZV

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** The official GSTIN check-character algorithm (mod 36). */
function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARS.indexOf(first14[i]);
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export type GstinCheck = { ok: true } | { ok: false; reason: string };

export function validateGstin(raw: string, stateCode?: string | null): GstinCheck {
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) {
    return { ok: false, reason: "GSTIN should look like 27AAPFU0939F1ZV (15 characters)." };
  }
  if (checkChar(gstin.slice(0, 14)) !== gstin[14]) {
    return { ok: false, reason: "This GSTIN has a typo — the last character doesn't match. Please re-check it." };
  }
  if (stateCode && gstin.slice(0, 2) !== stateCode) {
    return { ok: false, reason: `GSTIN starts with ${gstin.slice(0, 2)}, but the selected state's code is ${stateCode}.` };
  }
  return { ok: true };
}
