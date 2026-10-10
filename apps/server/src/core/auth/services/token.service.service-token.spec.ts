import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenService } from './token.service';
import { JwtType } from '../dto/jwt-payload';

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const user: any = {
  id: 'bot_1',
  email: 'bot@example.com',
  workspaceId: 'ws_1',
  deactivatedAt: null,
  deletedAt: null,
};

function createService() {
  // The same defaults the application's JwtModule applies (see token.module.ts).
  const jwtService = new JwtService({
    secret: SECRET,
    signOptions: { expiresIn: '30d', issuer: 'Docmost' },
  });
  const environmentService = { getAppSecret: () => SECRET } as any;
  return {
    jwtService,
    service: new TokenService(jwtService, environmentService),
  };
}

describe('TokenService.generateServiceToken', () => {
  it('signs {sub, workspaceId, serviceTokenId, type: service}', async () => {
    const { service, jwtService } = createService();

    const token = await service.generateServiceToken({
      serviceTokenId: 'token_1',
      user,
      workspaceId: 'ws_1',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const payload = jwtService.verify(token);
    expect(payload).toMatchObject({
      sub: 'bot_1',
      workspaceId: 'ws_1',
      serviceTokenId: 'token_1',
      type: JwtType.SERVICE,
      iss: 'Docmost',
    });
    expect(payload.type).toBe('service');
  });

  it('carries no email and no session id', async () => {
    const { service, jwtService } = createService();

    const token = await service.generateServiceToken({
      serviceTokenId: 'token_1',
      user,
      workspaceId: 'ws_1',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const payload = jwtService.decode(token);
    expect(payload).not.toHaveProperty('email');
    expect(payload).not.toHaveProperty('sessionId');
  });

  it('expires when the database row does, not after the module default of 30 days', async () => {
    const { service, jwtService } = createService();
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

    const token = await service.generateServiceToken({
      serviceTokenId: 'token_1',
      user,
      workspaceId: 'ws_1',
      expiresAt,
    });

    const { exp } = jwtService.decode(token);
    expect(Math.abs(exp * 1000 - expiresAt.getTime())).toBeLessThan(2000);
    // ... and a short expiry is honoured too, rather than raised to the default.
    const short = await service.generateServiceToken({
      serviceTokenId: 'token_2',
      user,
      workspaceId: 'ws_1',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
    });
    const shortExp = jwtService.decode(short).exp * 1000 - Date.now();
    expect(shortExp).toBeGreaterThan(60 * 60 * 1000);
    expect(shortExp).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
  });

  it('refuses an expiry that has already passed', async () => {
    const { service } = createService();

    await expect(
      service.generateServiceToken({
        serviceTokenId: 'token_1',
        user,
        workspaceId: 'ws_1',
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses to sign for a disabled user', async () => {
    const { service } = createService();

    await expect(
      service.generateServiceToken({
        serviceTokenId: 'token_1',
        user: { ...user, deactivatedAt: new Date() },
        workspaceId: 'ws_1',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('produces a token that verifyJwt accepts only as the service type', async () => {
    const { service } = createService();
    const token = await service.generateServiceToken({
      serviceTokenId: 'token_1',
      user,
      workspaceId: 'ws_1',
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.verifyJwt(token, JwtType.SERVICE),
    ).resolves.toMatchObject({ serviceTokenId: 'token_1' });
    // It can never be mistaken for an access, collab or attachment token.
    for (const type of [
      JwtType.ACCESS,
      JwtType.COLLAB,
      JwtType.ATTACHMENT,
      JwtType.API_KEY,
    ]) {
      await expect(service.verifyJwt(token, type)).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });

  it('is not accepted once tampered with', async () => {
    const { service } = createService();
    const token = await service.generateServiceToken({
      serviceTokenId: 'token_1',
      user,
      workspaceId: 'ws_1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        sub: 'owner_1',
        workspaceId: 'ws_1',
        serviceTokenId: 'token_1',
        type: 'service',
      }),
    ).toString('base64url');

    await expect(
      service.verifyJwt(`${header}.${forged}.${signature}`, JwtType.SERVICE),
    ).rejects.toThrow();
  });
});
