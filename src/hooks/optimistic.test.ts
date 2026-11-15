import { describe, expect, it } from 'vitest';
import type { DeviceStatus } from '@/api/types';
import { applyEvent, applyOptimistic } from './optimistic';

const status: DeviceStatus = {
  components: {
    main: {
      switch: { switch: { value: 'off' } },
      switchLevel: { level: { value: 10, unit: '%' } },
    },
  },
};

describe('optimistic updates', () => {
  it('predicts known commands without mutating the input', () => {
    const next = applyOptimistic(status, [
      { component: 'main', capability: 'switch', command: 'on' },
      { component: 'main', capability: 'switchLevel', command: 'setLevel', arguments: [55] },
    ]);
    expect(next.components.main!.switch!.switch!.value).toBe('on');
    expect(next.components.main!.switchLevel!.level).toMatchObject({ value: 55, unit: '%' });
    expect(status.components.main!.switch!.switch!.value).toBe('off');
  });

  it('never invents capabilities the device does not report', () => {
    const next = applyOptimistic(status, [{ component: 'main', capability: 'lock', command: 'lock' }]);
    expect(next.components.main!.lock).toBeUndefined();
  });

  it('applies pushed events immutably', () => {
    const next = applyEvent(status, {
      component: 'main',
      capability: 'switch',
      attribute: 'switch',
      value: 'on',
      time: 't',
    });
    expect(next.components.main!.switch!.switch).toEqual({ value: 'on', timestamp: 't' });
    expect(next).not.toBe(status);
    expect(status.components.main!.switch!.switch!.value).toBe('off');
  });
});
