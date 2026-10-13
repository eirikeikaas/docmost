import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { ServiceTokenController } from './service-token.controller';
import { ServiceTokenService } from './service-token.service';

// ServiceTokenRepo, UserRepo, WorkspaceRepo, AUDIT_SERVICE and CaslModule's
// WorkspaceAbilityFactory are all global, so only TokenModule (JwtService
// signing) has to be imported. AuthModule imports this module for
// the JWT strategy; this module must therefore never import AuthModule.
@Module({
  imports: [TokenModule],
  controllers: [ServiceTokenController],
  providers: [ServiceTokenService],
  exports: [ServiceTokenService],
})
export class ServiceTokenModule {}
