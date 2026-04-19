export interface CurrencyOption {
  code: string;
  label: string;
  symbol: string;
  locale: string;
}

// Top 10 international currencies + CAD as default
export const CURRENCIES: CurrencyOption[] = [
  { code: "CAD", label: "Canadian Dollar", symbol: "$", locale: "en-CA" },
  { code: "USD", label: "US Dollar", symbol: "$", locale: "en-US" },
  { code: "EUR", label: "Euro", symbol: "€", locale: "de-DE" },
  { code: "GBP", label: "British Pound", symbol: "£", locale: "en-GB" },
  { code: "JPY", label: "Japanese Yen", symbol: "¥", locale: "ja-JP" },
  { code: "CHF", label: "Swiss Franc", symbol: "CHF", locale: "de-CH" },
  { code: "AUD", label: "Australian Dollar", symbol: "$", locale: "en-AU" },
  { code: "CNY", label: "Chinese Yuan", symbol: "¥", locale: "zh-CN" },
  { code: "MXN", label: "Mexican Peso", symbol: "$", locale: "es-MX" },
  { code: "BRL", label: "Brazilian Real", symbol: "R$", locale: "pt-BR" },
];

export function getCurrency(code: string): CurrencyOption {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
}

export function formatMoney(amount: number, currencyCode = "CAD"): string {
  const c = getCurrency(currencyCode);
  try {
    return new Intl.NumberFormat(c.locale, {
      style: "currency",
      currency: c.code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${c.symbol}${(amount || 0).toFixed(2)}`;
  }
}

export function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}
