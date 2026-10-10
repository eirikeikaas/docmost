import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

// A full happy-path run (real authorization-code exchange against a mocked
// IdP) needs test infrastructure (an HTTP-mocking library, DB fixture
// seeding for an enabled provider) this repo doesn't have a precedent for
// yet. This covers the parts of the route surface that don't require
// standing up a fake IdP: input validation and the "nothing to resume"
// failure paths, against a real, migrated, workspace-having instance.
describe('SSO OIDC (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Every /api route 404s with "Workspace not found" until a workspace
    // exists. Fire setup and ignore the outcome - it 200s on a fresh
    // database, or fails harmlessly if a previous run already completed it,
    // either way leaving a workspace in place for the assertions below.
    await request(app.getHttpServer()).post('/api/auth/setup').send({
      name: 'SSO E2E Admin',
      email: `sso-e2e-${Date.now()}@example.com`,
      password: 'password1234',
      workspaceName: 'SSO E2E Workspace',
    });
  });

  it('rejects a non-UUID providerId on the login route', () => {
    return request(app.getHttpServer())
      .get('/api/sso/oidc/not-a-uuid/login')
      .expect(400);
  });

  it('404s on login for a provider that does not exist', () => {
    return request(app.getHttpServer())
      .get('/api/sso/oidc/00000000-0000-0000-0000-000000000000/login')
      .expect(404);
  });

  it('rejects the callback when there is no state cookie to resume', () => {
    return request(app.getHttpServer())
      .get('/api/sso/oidc/callback?code=irrelevant&state=irrelevant')
      .expect(400);
  });

  it('requires authentication on the admin provider CRUD routes', () => {
    return request(app.getHttpServer())
      .post('/api/sso/oidc/providers/list')
      .expect(401);
  });
});
