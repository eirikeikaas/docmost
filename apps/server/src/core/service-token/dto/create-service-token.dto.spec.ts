import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateServiceTokenDto } from './create-service-token.dto';
import { ServiceTokenIdDto } from './service-token-id.dto';

const userId = '0f1e2d3c-4b5a-4978-8a9b-0c1d2e3f4a5b';

async function errorsFor(input: Record<string, unknown>) {
  const dto = plainToInstance(CreateServiceTokenDto, input);
  return (await validate(dto, { whitelist: true })).map((e) => e.property);
}

describe('CreateServiceTokenDto', () => {
  it('accepts a name and a user, with the expiry optional', async () => {
    expect(await errorsFor({ name: 'TRYlle', userId })).toEqual([]);
  });

  it.each([1, 90, 365])('accepts expiresInDays = %s', async (expiresInDays) => {
    expect(await errorsFor({ name: 'TRYlle', userId, expiresInDays })).toEqual(
      [],
    );
  });

  it.each([0, -5, 366, 1.5, '30'])(
    'rejects expiresInDays = %s',
    async (expiresInDays) => {
      expect(
        await errorsFor({ name: 'TRYlle', userId, expiresInDays }),
      ).toContain('expiresInDays');
    },
  );

  it('rejects a missing, empty or over-long name', async () => {
    expect(await errorsFor({ userId })).toContain('name');
    expect(await errorsFor({ name: '', userId })).toContain('name');
    expect(await errorsFor({ name: 'x'.repeat(101), userId })).toContain(
      'name',
    );
  });

  it('rejects a user id that is not a UUID', async () => {
    expect(await errorsFor({ name: 'TRYlle', userId: 'bot' })).toContain(
      'userId',
    );
    expect(await errorsFor({ name: 'TRYlle' })).toContain('userId');
  });

  it('drops unknown properties, so a caller cannot smuggle in a role or workspace', async () => {
    const dto = plainToInstance(CreateServiceTokenDto, {
      name: 'TRYlle',
      userId,
      workspaceId: 'other',
      role: 'owner',
      token: 'x',
    });
    await validate(dto, { whitelist: true });

    expect(dto).not.toHaveProperty('workspaceId');
    expect(dto).not.toHaveProperty('role');
    expect(dto).not.toHaveProperty('token');
  });
});

describe('ServiceTokenIdDto', () => {
  it('needs a UUID', async () => {
    expect(
      await validate(plainToInstance(ServiceTokenIdDto, { id: userId })),
    ).toEqual([]);
    expect(
      (await validate(plainToInstance(ServiceTokenIdDto, { id: 'x' }))).length,
    ).toBe(1);
  });
});
