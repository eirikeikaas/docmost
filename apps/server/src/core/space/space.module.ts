import { Module } from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { SpaceController } from './space.controller';
import { SpaceMemberService } from './services/space-member.service';
import { DecisionService } from './services/decision.service';
import { SpaceLinkService } from './services/space-link.service';

@Module({
  imports: [],
  controllers: [SpaceController],
  providers: [
    SpaceService,
    SpaceMemberService,
    DecisionService,
    SpaceLinkService,
  ],
  exports: [
    SpaceService,
    SpaceMemberService,
    DecisionService,
    SpaceLinkService,
  ],
})
export class SpaceModule {}
