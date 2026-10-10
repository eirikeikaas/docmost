import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SsoOidcController } from './controllers/sso-oidc.controller';
import { SsoProviderController } from './controllers/sso-provider.controller';
import { OidcClientRegistryService } from './services/oidc-client-registry.service';
import { SsoOidcLoginService } from './services/sso-oidc-login.service';
import { SsoProviderService } from './services/sso-provider.service';

// Everything this module needs beyond SignupService (EncryptionService,
// SessionService, AUDIT_SERVICE, the auth-provider/auth-account/user repos,
// EnvironmentService, CaslModule's WorkspaceAbilityFactory) is already
// @Global(), so there is nothing else to import here.
@Module({
  imports: [AuthModule],
  controllers: [SsoOidcController, SsoProviderController],
  providers: [
    OidcClientRegistryService,
    SsoOidcLoginService,
    SsoProviderService,
  ],
})
export class SsoModule {}
