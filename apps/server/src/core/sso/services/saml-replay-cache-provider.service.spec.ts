import { SamlReplayCacheProvider } from './saml-replay-cache-provider.service';

function createProvider() {
  const store = new Map<string, string>();
  const cacheManager: any = {
    get: jest.fn((key: string) => Promise.resolve(store.get(key))),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
  return { provider: new SamlReplayCacheProvider(cacheManager), cacheManager, store };
}

describe('SamlReplayCacheProvider', () => {
  it('round-trips a saved value through getAsync', async () => {
    const { provider } = createProvider();

    await provider.saveAsync('request_1', 'some-value');

    await expect(provider.getAsync('request_1')).resolves.toBe('some-value');
  });

  it('returns null for a key that was never saved', async () => {
    const { provider } = createProvider();

    await expect(provider.getAsync('missing')).resolves.toBeNull();
  });

  it('removes a value and returns its prior contents', async () => {
    const { provider } = createProvider();
    await provider.saveAsync('request_1', 'some-value');

    const removed = await provider.removeAsync('request_1');

    expect(removed).toBe('some-value');
    await expect(provider.getAsync('request_1')).resolves.toBeNull();
  });

  it('namespaces keys so they cannot collide with unrelated cache entries', async () => {
    const { provider, cacheManager } = createProvider();

    await provider.saveAsync('request_1', 'some-value');

    expect(cacheManager.set).toHaveBeenCalledWith(
      expect.stringContaining('request_1'),
      'some-value',
      expect.any(Number),
    );
    expect(cacheManager.set.mock.calls[0][0]).not.toBe('request_1');
  });
});
