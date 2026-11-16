import type { Document } from '@copilot/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiBlob, apiDelete: vi.fn(), apiGet: vi.fn(), apiPost: vi.fn() }));

import { downloadDocument } from './documents';

describe('downloadDocument', () => {
  const click = vi.fn();
  const revoke = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    apiBlob.mockResolvedValue(new Blob(['x']));
    vi.stubGlobal('document', { createElement: () => ({ click, href: '', download: '' }) });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:fake', revokeObjectURL: revoke });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('keeps the blob URL alive until the browser has had time to start the download', async () => {
    await downloadDocument('p1', { id: 'd1', name: 'spec.pdf' } as Document);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).not.toHaveBeenCalled(); // not revoked in the same tick as the click
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });
});
