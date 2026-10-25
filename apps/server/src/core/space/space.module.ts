import { Module } from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { SpaceController } from './space.controller';
import { SpaceMemberService } from './services/space-member.service';
import { DecisionService } from './services/decision.service';

@Module({
  imports: [],
  controllers: [SpaceController],
  providers: [SpaceService, SpaceMemberService, DecisionService],
  exports: [SpaceService, SpaceMemberService, DecisionService],
})
export class SpaceModule {}
