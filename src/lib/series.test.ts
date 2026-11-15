import { describe, expect, it } from 'vitest';
import type { DeviceEvent } from '@/api/types';
import { bucketAverage, dailyEnergyByDevice, totalPowerSeries } from './series';

const ev = (deviceId: string, epoch: number, value: number, attribute = 'power'): DeviceEvent => ({
  deviceId,
  deviceName: deviceId,
  locationId: 'l',
  component: 'main',
  capability: 'powerMeter',
  attribute,
  value,
  time: new Date(epoch).toISOString(),
  epoch,
});

const H = 3_600_000;

describe('series helpers', () => {
  it('averages values per bucket', () => {
    const points = bucketAverage([ev('a', 0, 10), ev('a', 10, 20), ev('a', H, 5)], H, 0, 2 * H);
    expect(points).toEqual([
      { t: 0, v: 15 },
      { t: H, v: 5 },
    ]);
  });

  it('sums devices and carries readings forward', () => {
    const points = totalPowerSeries([ev('a', 0, 100), ev('b', 0, 50), ev('a', 2 * H, 0)], H, 0, 2 * H);
    expect(points.map((p) => p.v)).toEqual([150, 150, 50]);
  });

  it('integrates watts into daily kWh', () => {
    const start = new Date(2026, 10, 16, 8).getTime();
    const energy = dailyEnergyByDevice([
      ev('a', start, 1000),
      ev('a', start + 15 * 60_000, 1000),
      ev('a', start + 30 * 60_000, 0),
    ]);
    const day = [...energy.values()][0]!;
    expect(day.get('a')).toBeCloseTo(0.5, 5);
  });

  it('caps gaps so missing data does not explode totals', () => {
    const start = new Date(2026, 10, 16, 1).getTime();
    const energy = dailyEnergyByDevice([ev('a', start, 1000), ev('a', start + 10 * H, 0)]);
    expect([...energy.values()][0]!.get('a')).toBeCloseTo(0.5, 5);
  });
});
