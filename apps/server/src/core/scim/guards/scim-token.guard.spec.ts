import { UnauthorizedException } from '@nestjs/common';
import { ScimTokenGuard } from './scim-token.guard';

function createContext(headers: Record<string, string>, workspace: any = { id: 'ws_1' }) {
  const req: any = { headers, raw: { workspace } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

describe('ScimTokenGuard', () => {
  it('rejects a request with no Authorization header', async () => {
    const scimTokenRepo = { findByTokenHash: jest.fn() };
    const guard = new ScimTokenGuard(scimTokenRepo as any);

    await expect(guard.canActivate(createContext({}))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(scimTokenRepo.findByTokenHash).not.toHaveBeenCalled();
  });

  it('rejects a request with no resolved workspace', async () => {
    const scimTokenRepo = { findByTokenHash: jest.fn() };
    const guard = new ScimTokenGuard(scimTokenRepo as any);

    await expect(
      guard.canActivate(
        createContext({ authorization: 'Bearer scim_abc' }, undefined),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown or disabled token', async () => {
    const scimTokenRepo = { findByTokenHash: jest.fn().mockResolvedValue(undefined) };
    const guard = new ScimTokenGuard(scimTokenRepo as any);

    await expect(
      guard.canActivate(createContext({ authorization: 'Bearer scim_bad' })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('allows a valid token and touches lastUsedAt', async () => {
    const scimToken = { id: 'token_1' };
    const scimTokenRepo = {
      findByTokenHash: jest.fn().mockResolvedValue(scimToken),
      touchLastUsed: jest.fn().mockResolvedValue(undefined),
    };
    const guard = new ScimTokenGuard(scimTokenRepo as any);
    const ctx = createContext({ authorization: 'Bearer scim_good' });

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(scimTokenRepo.touchLastUsed).toHaveBeenCalledWith('token_1');
  });
});
