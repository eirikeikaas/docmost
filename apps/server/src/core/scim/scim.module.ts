import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ScimController } from './controllers/scim.controller';
import { ScimTokenController } from './controllers/scim-token.controller';
import { ScimTokenService } from './services/scim-token.service';
import { ScimUserService } from './services/scim-user.service';
import { ScimGroupService } from './services/scim-group.service';
import { ScimResourcesRegistrar } from './scim-resources.registrar';
import { ScimTokenGuard } from './guards/scim-token.guard';

// Everything else this module needs (ScimTokenRepo, UserRepo, GroupRepo,
// GroupUserRepo, UserSessionRepo, AUDIT_SERVICE, CaslModule's
// WorkspaceAbilityFactory) is already @Global().
@Module({
  imports: [AuthModule],
  controllers: [ScimController, ScimTokenController],
  providers: [
    ScimTokenService,
    ScimUserService,
    ScimGroupService,
    ScimResourcesRegistrar,
    ScimTokenGuard,
  ],
})
export class ScimModule {}
