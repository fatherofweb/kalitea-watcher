const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'sr,en;q=0.8' },
    signal: AbortSignal.timeout(25000),
  });
  if (res.status === 403 || res.status === 429) throw new Error(`HTTP ${res.status} (blokada) na ${url}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} na ${url}`);
  return res.text();
}

export function jitterDelay(minMs = 2000, maxMs = 5000): Promise<void> {
  const ms = minMs + Math.floor(Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}
