import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOidcProviderDto } from './create-oidc-provider.dto';
import { UpdateOidcProviderDto } from './update-oidc-provider.dto';

const base = {
  name: 'Microsoft Entra ID',
  oidcIssuer: 'https://login.microsoftonline.com/tenant/v2.0',
  oidcClientId: 'client-id',
  oidcClientSecret: 'secret',
};

async function errorsFor(extra: Record<string, unknown>) {
  const dto = plainToInstance(CreateOidcProviderDto, { ...base, ...extra });
  const errors = await validate(dto, { whitelist: true });
  return errors.map((e) => e.property);
}

describe('CreateOidcProviderDto - settings fields', () => {
  it('accepts a request without any of the new fields', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('accepts a full, valid settings payload', async () => {
    expect(
      await errorsFor({
        trustUnverifiedEmail: true,
        roleClaim: 'roles',
        roleMap: { agents_admin: 'admin', agents_manage: 'member' },
        defaultRole: 'member',
        requiredRoles: ['agents_admin', 'agents_manage'],
      }),
    ).toEqual([]);
  });

  it('keeps the new fields when the global whitelist pipe runs', async () => {
    const dto = plainToInstance(CreateOidcProviderDto, {
      ...base,
      trustUnverifiedEmail: true,
      roleClaim: 'roles',
      roleMap: { agents_admin: 'admin' },
      defaultRole: 'member',
      requiredRoles: ['agents_admin'],
      notAField: 'dropped',
    });
    await validate(dto, { whitelist: true });

    expect(dto).toMatchObject({
      trustUnverifiedEmail: true,
      roleClaim: 'roles',
      roleMap: { agents_admin: 'admin' },
      defaultRole: 'member',
      requiredRoles: ['agents_admin'],
    });
    expect(dto).not.toHaveProperty('notAField');
  });

  it('rejects owner in roleMap and as defaultRole', async () => {
    expect(await errorsFor({ roleMap: { agents_owner: 'owner' } })).toContain(
      'roleMap',
    );
    expect(await errorsFor({ defaultRole: 'owner' })).toContain('defaultRole');
  });

  it('rejects malformed roleMap values', async () => {
    expect(await errorsFor({ roleMap: ['admin'] })).toContain('roleMap');
    expect(await errorsFor({ roleMap: 'agents_admin=admin' })).toContain(
      'roleMap',
    );
    expect(await errorsFor({ roleMap: { x: 'superuser' } })).toContain(
      'roleMap',
    );
    expect(await errorsFor({ roleMap: { '   ': 'admin' } })).toContain(
      'roleMap',
    );
  });

  it('rejects non-boolean trustUnverifiedEmail and bad requiredRoles', async () => {
    expect(await errorsFor({ trustUnverifiedEmail: 'yes' })).toContain(
      'trustUnverifiedEmail',
    );
    expect(await errorsFor({ requiredRoles: 'agents_admin' })).toContain(
      'requiredRoles',
    );
    expect(await errorsFor({ requiredRoles: [1, 2] })).toContain(
      'requiredRoles',
    );
    expect(await errorsFor({ requiredRoles: [''] })).toContain('requiredRoles');
  });

  it('rejects a roleClaim with whitespace or empty', async () => {
    expect(await errorsFor({ roleClaim: 'my roles' })).toContain('roleClaim');
    expect(await errorsFor({ roleClaim: '' })).toContain('roleClaim');
  });

  it('inherits the new fields in the update DTO, all optional', async () => {
    const dto = plainToInstance(UpdateOidcProviderDto, {
      id: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
      requiredRoles: ['agents_admin'],
    });
    expect(await validate(dto, { whitelist: true })).toEqual([]);

    const bad = plainToInstance(UpdateOidcProviderDto, {
      id: '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b',
      roleMap: { x: 'owner' },
    });
    expect(
      (await validate(bad, { whitelist: true })).map((e) => e.property),
    ).toContain('roleMap');
  });
});
