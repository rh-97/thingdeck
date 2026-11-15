import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Devices from '@/pages/Devices';
import { renderWithHome } from '@/test/render';

describe('Devices page', () => {
  it('lists devices grouped by room and toggles a light', async () => {
    const { client } = renderWithHome(<Devices />, { route: '/devices' });
    const toggle = await screen.findByRole('switch', { name: 'Floor Lamp power' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await userEvent.click(toggle);

    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    const lamp = client.engine.idFor('living-lamp');
    expect(client.engine.getStatus(lamp).components.main!.switch!.switch!.value).toBe('on');
  });

  it('filters by search text', async () => {
    renderWithHome(<Devices />, { route: '/devices?q=fridge' });
    await screen.findByText('No devices match');
    renderWithHome(<Devices />, { route: '/devices?q=refrigerator' });
    expect(await screen.findByRole('link', { name: 'Refrigerator' })).toBeInTheDocument();
  });

  it('asks for confirmation before unlocking a door', async () => {
    const { client } = renderWithHome(<Devices />, { route: '/devices?q=lock' });
    await userEvent.click(await screen.findByRole('button', { name: 'Unlock' }));
    expect(await screen.findByRole('dialog', { name: 'Unlock Front Door Lock?' })).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Unlock' }).at(-1)!);
    await waitFor(() =>
      expect(
        client.engine.getStatus(client.engine.idFor('entry-lock')).components.main!.lock!.lock!.value,
      ).toBe('unlocked'),
    );
  });
});
