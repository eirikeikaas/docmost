import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

// Mirrors sso-oidc.e2e-spec.ts's scope: a full ACS round trip against a
// real IdP needs test infrastructure (a signed SAMLResponse fixture, DB
// fixture seeding) this repo doesn't have a precedent for yet. This covers
// the parts of the route surface that don't require one.
describe('SSO SAML (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer()).post('/api/auth/setup').send({
      name: 'SAML E2E Admin',
      email: `saml-e2e-${Date.now()}@example.com`,
      password: 'password1234',
      workspaceName: 'SAML E2E Workspace',
    });
  });

  it('serves SP metadata as XML', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/sso/saml/metadata')
      .expect(200);

    expect(res.headers['content-type']).toContain('xml');
    expect(res.text).toContain('EntityDescriptor');
  });

  it('rejects a non-UUID providerId on the login route', () => {
    return request(app.getHttpServer())
      .get('/api/sso/saml/not-a-uuid/login')
      .expect(400);
  });

  it('404s on login for a provider that does not exist', () => {
    return request(app.getHttpServer())
      .get('/api/sso/saml/00000000-0000-0000-0000-000000000000/login')
      .expect(404);
  });

  it('rejects the callback when there is no state cookie to resume', () => {
    return request(app.getHttpServer())
      .post('/api/sso/saml/callback')
      .type('form')
      .send({ SAMLResponse: 'irrelevant', RelayState: 'irrelevant' })
      .expect(400);
  });

  it('requires authentication on the admin provider CRUD routes', () => {
    return request(app.getHttpServer())
      .post('/api/sso/saml/providers/list')
      .expect(401);
  });
});
