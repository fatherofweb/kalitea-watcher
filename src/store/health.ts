import { supa } from './supabase.js';

export type FailureType = 'fetch' | 'block' | 'markup';

export interface HealthRow {
  source: string;
  consecutiveFailures: number;
  lastOkAt: string | null;
}

export interface HealthTransition {
  source: string;
  becameFailing: boolean;
  recovered: boolean;
  consecutiveFailures: number;
  reachedThreshold: boolean;
  failureType?: FailureType;
}

export function classifyFailure(err: unknown): FailureType {
  const m = String(err instanceof Error ? err.message : err).toLowerCase();
  if (m.includes('403') || m.includes('429') || m.includes('cloudflare') || m.includes('challenge'))
    return 'block';
  if (m.includes('0 offers') || m.includes('markup') || m.includes('empty parse')) return 'markup';
  return 'fetch';
}

export function applyResult(
  prev: HealthRow,
  ok: boolean,
  _offerCount: number,
  failureType?: FailureType,
): HealthTransition {
  if (ok) {
    return {
      source: prev.source,
      becameFailing: false,
      recovered: prev.consecutiveFailures > 0,
      consecutiveFailures: 0,
      reachedThreshold: false,
    };
  }
  const cf = prev.consecutiveFailures + 1;
  return {
    source: prev.source,
    becameFailing: prev.consecutiveFailures === 0,
    recovered: false,
    consecutiveFailures: cf,
    reachedThreshold: cf >= 3,
    failureType,
  };
}

export async function loadHealth(source: string): Promise<HealthRow> {
  const { data } = await supa()
    .from('source_health')
    .select('*')
    .eq('source', source)
    .maybeSingle();
  return {
    source,
    consecutiveFailures: data?.consecutive_failures ?? 0,
    lastOkAt: data?.last_ok_at ?? null,
  };
}

export async function saveHealth(t: HealthTransition, error?: string): Promise<void> {
  const patch: Record<string, unknown> = {
    source: t.source,
    consecutive_failures: t.consecutiveFailures,
  };
  if (t.consecutiveFailures === 0) patch.last_ok_at = new Date().toISOString();
  if (error) {
    patch.last_error = error;
    patch.last_failure_type = t.failureType ?? null;
  }
  await supa().from('source_health').upsert(patch, { onConflict: 'source' });
}
