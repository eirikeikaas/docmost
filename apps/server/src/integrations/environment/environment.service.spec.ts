import { Test, TestingModule } from '@nestjs/testing';
import { EnvironmentService } from './environment.service';

describe('EnvironmentService', () => {
  let service: EnvironmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnvironmentService],
    }).compile();

    service = module.get<EnvironmentService>(EnvironmentService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('EnvironmentService - SSO_OIDC_ENTRA_*', () => {
  function serviceWith(values: Record<string, string | undefined>) {
    const configService = {
      get: jest.fn((key: string, fallback?: unknown) =>
        values[key] !== undefined ? values[key] : fallback,
      ),
    };
    return new EnvironmentService(configService as any);
  }

  it('reports nothing set by default', () => {
    const service = serviceWith({});

    expect(service.getSsoOidcEntraTenantId()).toBeUndefined();
    expect(service.getSsoOidcEntraClientId()).toBeUndefined();
    expect(service.getSsoOidcEntraClientSecret()).toBeUndefined();
    expect(service.getSsoOidcEntraRoleMap()).toBe('');
    expect(service.getSsoOidcEntraRequiredRoles()).toEqual([]);
  });

  it('defaults the display name and allowSignup', () => {
    const service = serviceWith({});

    expect(service.getSsoOidcEntraDisplayName()).toBe('Microsoft Entra ID');
    expect(service.getSsoOidcEntraAllowSignup()).toBe(true);
  });

  it('treats blank values as unset', () => {
    const service = serviceWith({
      SSO_OIDC_ENTRA_TENANT_ID: '  ',
      SSO_OIDC_ENTRA_DISPLAY_NAME: '',
      SSO_OIDC_ENTRA_ALLOW_SIGNUP: '',
    });

    expect(service.getSsoOidcEntraTenantId()).toBeUndefined();
    expect(service.getSsoOidcEntraDisplayName()).toBe('Microsoft Entra ID');
    expect(service.getSsoOidcEntraAllowSignup()).toBe(true);
  });

  it('reads and trims the configured values', () => {
    const service = serviceWith({
      SSO_OIDC_ENTRA_TENANT_ID: ' tenant ',
      SSO_OIDC_ENTRA_CLIENT_ID: 'client',
      SSO_OIDC_ENTRA_CLIENT_SECRET: 'secret',
      SSO_OIDC_ENTRA_DISPLAY_NAME: 'TRY Entra',
      SSO_OIDC_ENTRA_ALLOW_SIGNUP: 'FALSE',
      SSO_OIDC_ENTRA_ROLE_MAP: 'a=admin,b=member',
    });

    expect(service.getSsoOidcEntraTenantId()).toBe('tenant');
    expect(service.getSsoOidcEntraClientId()).toBe('client');
    expect(service.getSsoOidcEntraClientSecret()).toBe('secret');
    expect(service.getSsoOidcEntraDisplayName()).toBe('TRY Entra');
    expect(service.getSsoOidcEntraAllowSignup()).toBe(false);
    expect(service.getSsoOidcEntraRoleMap()).toBe('a=admin,b=member');
  });

  it('splits, trims and de-duplicates the required roles', () => {
    const service = serviceWith({
      SSO_OIDC_ENTRA_REQUIRED_ROLES: ' agents_admin, agents_manage ,,agents_admin',
    });

    expect(service.getSsoOidcEntraRequiredRoles()).toEqual([
      'agents_admin',
      'agents_manage',
    ]);
  });
});
