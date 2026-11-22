/** Kronor without decimals ("1 250 kr"). Autarki shows money in SEK. */
export const formatKr = (value: number) => `${value.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} kr`;

/** "250 g" under a kilo, "1.5 kg" from there. */
export function formatQuantity(kg: number): string {
  return kg < 1 ? `${Math.round(kg * 1000)} g` : `${kg} kg`;
}

export const today = () => new Date().toISOString().slice(0, 10);
