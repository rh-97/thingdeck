import type { DeviceEvent } from '@/api/types';

export interface Point {
  t: number;
  v: number;
}

/** Group numeric events into fixed buckets, averaging within each bucket. */
export function bucketAverage(events: DeviceEvent[], bucketMs: number, from: number, to: number): Point[] {
  const buckets = new Map<number, { sum: number; n: number }>();
  for (const e of events) {
    const v = Number(e.value);
    if (!Number.isFinite(v) || e.epoch < from || e.epoch > to) continue;
    const key = Math.floor(e.epoch / bucketMs) * bucketMs;
    const b = buckets.get(key) ?? { sum: 0, n: 0 };
    b.sum += v;
    b.n += 1;
    buckets.set(key, b);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([t, b]) => ({ t, v: b.sum / b.n }));
}

/**
 * Total household power per bucket: carries each device's last known reading
 * forward so sparse event streams still sum correctly.
 */
export function totalPowerSeries(events: DeviceEvent[], bucketMs: number, from: number, to: number): Point[] {
  const sorted = events.filter((e) => e.attribute === 'power').sort((a, b) => a.epoch - b.epoch);
  const latest = new Map<string, number>();
  const out: Point[] = [];
  let i = 0;
  // Seed with readings from before the window.
  while (i < sorted.length && sorted[i]!.epoch < from) {
    latest.set(sorted[i]!.deviceId, Number(sorted[i]!.value));
    i++;
  }
  for (let t = Math.floor(from / bucketMs) * bucketMs; t <= to; t += bucketMs) {
    const end = t + bucketMs;
    const samples = new Map<string, { sum: number; n: number }>();
    while (i < sorted.length && sorted[i]!.epoch < end) {
      const e = sorted[i]!;
      const v = Number(e.value);
      if (Number.isFinite(v)) {
        const s = samples.get(e.deviceId) ?? { sum: 0, n: 0 };
        s.sum += v;
        s.n += 1;
        samples.set(e.deviceId, s);
        latest.set(e.deviceId, v);
      }
      i++;
    }
    let total = 0;
    for (const [deviceId, last] of latest) {
      const s = samples.get(deviceId);
      total += s ? s.sum / s.n : last;
    }
    out.push({ t, v: total });
  }
  return out;
}

/** Integrates power readings (W) into energy (kWh) per device per day. */
export function dailyEnergyByDevice(events: DeviceEvent[], maxGapMs = 30 * 60_000) {
  const byDevice = new Map<string, DeviceEvent[]>();
  for (const e of events) {
    if (e.attribute !== 'power') continue;
    const list = byDevice.get(e.deviceId) ?? [];
    list.push(e);
    byDevice.set(e.deviceId, list);
  }
  const result = new Map<string, Map<string, number>>(); // day -> deviceId -> kWh
  for (const [deviceId, list] of byDevice) {
    list.sort((a, b) => a.epoch - b.epoch);
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i]!;
      const b = list[i + 1]!;
      const dt = Math.min(b.epoch - a.epoch, maxGapMs);
      const kwh = (Number(a.value) * dt) / 3_600_000 / 1000;
      if (!Number.isFinite(kwh)) continue;
      const day = dayKey(a.epoch);
      const devices = result.get(day) ?? new Map<string, number>();
      devices.set(deviceId, (devices.get(deviceId) ?? 0) + kwh);
      result.set(day, devices);
    }
  }
  return result;
}

export function dayKey(epoch: number) {
  const d = new Date(epoch);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
