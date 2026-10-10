import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SsoOidcController } from './controllers/sso-oidc.controller';
import { SsoProviderController } from './controllers/sso-provider.controller';
import { SsoSamlController } from './controllers/sso-saml.controller';
import { SamlProviderController } from './controllers/saml-provider.controller';
import { OidcClientRegistryService } from './services/oidc-client-registry.service';
import { SsoLoginService } from './services/sso-login.service';
import { SsoProviderService } from './services/sso-provider.service';
import { SamlClientRegistryService } from './services/saml-client-registry.service';
import { SamlProviderService } from './services/saml-provider.service';
import { SamlReplayCacheProvider } from './services/saml-replay-cache-provider.service';

// Everything this module needs beyond SignupService (EncryptionService,
// SessionService, AUDIT_SERVICE, the auth-provider/auth-account/user repos,
// EnvironmentService, CaslModule's WorkspaceAbilityFactory, CACHE_MANAGER)
// is already @Global(), so there is nothing else to import here.
@Module({
  imports: [AuthModule],
  controllers: [
    SsoOidcController,
    SsoProviderController,
    SsoSamlController,
    SamlProviderController,
  ],
  providers: [
    OidcClientRegistryService,
    SsoLoginService,
    SsoProviderService,
    SamlClientRegistryService,
    SamlProviderService,
    SamlReplayCacheProvider,
  ],
})
export class SsoModule {}
