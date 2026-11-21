import type { Cents } from "./money.ts";

export function tierDiscount(quantity: number): number {
  if (quantity >= 100) return 15;
  if (quantity >= 20) return 10;
  if (quantity >= 5) return 5;
  return 0;
}

export function applyDiscount(cents: Cents, percent: number): Cents {
  return Math.round(cents * (1 - percent / 100));
}

export function addTax(cents: Cents, rate: number): Cents {
  return Math.round(cents * (1 + rate));
}

export function lineTotal(unit: Cents, quantity: number, taxRate = 0): Cents {
  const discounted = applyDiscount(unit * quantity, tierDiscount(quantity));
  return addTax(discounted, taxRate);
}
