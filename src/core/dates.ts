const MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  mart: 3,
  april: 4,
  maj: 5,
  jun: 6,
  jul: 7,
  avgust: 8,
  septembar: 9,
  oktobar: 10,
  novembar: 11,
  decembar: 12,
};

export function parseSerbianDate(input: string, year: number): string {
  const s = input.trim().toLowerCase();
  // "1. avgust" / "1 avgust"
  const named = s.match(/^(\d{1,2})\.?\s+([a-zčćšđž]+)/);
  if (named) {
    const day = Number(named[1]);
    const month = MONTHS[named[2]!];
    if (month && day >= 1 && day <= 31) return iso(year, month, day);
  }
  // "03.08" / "3.8." / "03.08.2026"
  const numeric = s.match(/^(\d{1,2})\.(\d{1,2})\.?(\d{4})?/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const y = numeric[3] ? Number(numeric[3]) : year;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return iso(y, month, day);
  }
  throw new Error(`Neparsabilan datum: "${input}"`);
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Polazak može imati VIŠE datuma u jednom stringu: "18. i 28. jul", "18, 28. jul".
// Vraća listu ISO datuma (mesec se deli između svih dana). Prazna lista ako ništa.
export function parseDepartures(input: string, year: number): string[] {
  const text = input.trim();
  // imenovani mesec na kraju: "18. i 28. jul" → mesec "jul", dani 18 i 28
  const trailingMonth = text.match(/([a-zčćšđž]+)\s*$/i);
  if (trailingMonth) {
    const month = trailingMonth[1]!;
    const daysPart = text.slice(0, trailingMonth.index);
    const days = daysPart.match(/\d{1,2}/g) ?? [];
    if (days.length > 0) {
      const out: string[] = [];
      for (const d of days) {
        try {
          out.push(parseSerbianDate(`${d}. ${month}`, year));
        } catch {
          // preskoči nevalidan dan
        }
      }
      if (out.length > 0) return out;
    }
  }
  // jedan datum (numerički "03.08" ili sl.)
  try {
    return [parseSerbianDate(text, year)];
  } catch {
    return [];
  }
}
