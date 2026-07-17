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

// Polazak može imati VIŠE datuma u jednom stringu, u raznim varijantama:
//   "19. jul"                → jedan
//   "18. i 28. jul"          → 2 dana, deljeni mesec
//   "18, 23. i 28. jul"      → 3+ dana, deljeni mesec
//   "28. jul i 04. avgust"   → različiti meseci
//   "28.07 i 04.08"          → numerički višestruki
// Nikad ne baca — vraća listu ISO datuma (prazna ako ništa nije parsabilno).
export function parseDepartures(input: string, year: number): string[] {
  const text = input.trim();
  if (!text) return [];
  // razdvoj po separatorima: i / ili / , / ; / / / & / +
  const parts = text
    .split(/\s*(?:,|;|\/|&|\+|\bili\b|\bi\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const segments = parts.length > 0 ? parts : [text];

  const monthOf = (s: string): string | null => {
    const m = s.match(/([a-zčćšđž]{3,})\s*$/i);
    return m ? m[1]! : null;
  };
  const dayOnly = (s: string): string | null => {
    const m = s.match(/^\s*(\d{1,2})\.?\s*$/);
    return m ? m[1]! : null;
  };

  const out: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    // 1) fragment koji se sam parsira (ima mesec ili je numerički "28.07")
    try {
      out.push(parseSerbianDate(seg, year));
      continue;
    } catch {
      // nastavi
    }
    // 2) goli dan ("18") → pozajmi mesec od sledećeg (pa prethodnog) fragmenta
    const day = dayOnly(seg);
    if (!day) continue;
    let month: string | null = null;
    for (let j = i + 1; j < segments.length && !month; j++) month = monthOf(segments[j]!);
    for (let j = i - 1; j >= 0 && !month; j--) month = monthOf(segments[j]!);
    if (!month) continue;
    try {
      out.push(parseSerbianDate(`${day}. ${month}`, year));
    } catch {
      // preskoči
    }
  }
  return [...new Set(out)];
}
