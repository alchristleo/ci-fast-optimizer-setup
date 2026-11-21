export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function fromCents(cents: Cents): number {
  return cents / 100;
}

export function addMoney(...values: Cents[]): Cents {
  return values.reduce((sum, v) => sum + v, 0);
}

export function formatMoney(cents: Cents, currency = "USD"): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const units = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const rest = (abs % 100).toString().padStart(2, "0");
  return `${sign}${units}.${rest} ${currency}`;
}

export function splitMoney(total: Cents, parts: number): Cents[] {
  if (parts <= 0) throw new Error("parts must be positive");
  const base = Math.floor(total / parts);
  const extra = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < extra ? 1 : 0));
}
