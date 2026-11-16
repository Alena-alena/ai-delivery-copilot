import { vi } from 'vitest';
import { SystemController } from './system.controller.js';

describe('SystemController', () => {
  it('reports ok with the Python response and forwards the request id', async () => {
    const get = vi.fn().mockResolvedValue({ status: 'ok' });
    const out = await new SystemController({ get } as never).aiHealth({
      id: 'r-7',
    } as never);
    expect(out).toEqual({ status: 'ok', ai: { status: 'ok' } });
    expect(get).toHaveBeenCalledWith('/v1/ping', 'r-7');
  });

  it('propagates AiClient failures', async () => {
    const get = vi.fn().mockRejectedValue(new Error('down'));
    await expect(
      new SystemController({ get } as never).aiHealth({ id: 'r' } as never),
    ).rejects.toThrow('down');
  });
});
