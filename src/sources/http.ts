const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

// Browser-like headeri: neki WAF/LiteSpeed serveri vraćaju 415 bez ovih (halotours/hedonic).
const HEADERS: Record<string, string> = {
  'user-agent': UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'sr,en;q=0.8',
};

// Prolazni statusi/greške → vredi retry (povremeni 415/timeout/5xx na mušičavim sajtovima).
function isTransientStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 415 || status === 425;
}

export async function fetchHtml(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown = new Error(`fetch nije pokrenut: ${url}`);
  for (let i = 0; i < attempts; i++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(25000) });
    } catch (e) {
      lastErr = e; // network/timeout (AbortError) → retry
      if (i < attempts - 1) await jitterDelay(800, 1800);
      continue;
    }
    if (res.status === 403 || res.status === 429) {
      throw new Error(`HTTP ${res.status} (blokada) na ${url}`); // blokada — ne retry-uj
    }
    if (res.ok) return res.text();
    lastErr = new Error(`HTTP ${res.status} na ${url}`);
    if (isTransientStatus(res.status) && i < attempts - 1) {
      await jitterDelay(800, 1800);
      continue; // prolazno → pokušaj ponovo
    }
    throw lastErr; // trajno (npr. 404)
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export function jitterDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}
