import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

// Covers unauthenticated/misconfigured-request behavior and the admin
// token-management routes. A full provisioning round trip (create/patch/
// deactivate a real user via the protocol endpoints) needs a real bearer
// token minted through the authenticated admin API first - a reasonable
// follow-up once this repo has fixture-seeding infrastructure for e2e
// tests, same limitation noted for the OIDC and SAML milestones.
describe('SCIM (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/api/auth/setup').send({
      name: 'SCIM E2E Admin',
      email: `scim-e2e-${Date.now()}@example.com`,
      password: 'password1234',
      workspaceName: 'SCIM E2E Workspace',
    });
  });

  it('rejects a SCIM request with no bearer token', () => {
    return request(app.getHttpServer()).get('/api/scim/v2/Users').expect(401);
  });

  it('rejects a SCIM request with an unknown bearer token', () => {
    return request(app.getHttpServer())
      .get('/api/scim/v2/Users')
      .set('Authorization', 'Bearer scim_not-a-real-token')
      .expect(401);
  });

  it('requires authentication on the admin token-management routes', () => {
    return request(app.getHttpServer())
      .post('/api/scim-tokens/list')
      .expect(401);
  });
});
