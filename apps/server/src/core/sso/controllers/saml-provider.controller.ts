import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';
import { SamlProviderService } from '../services/saml-provider.service';
import { CreateSamlProviderDto } from '../dto/create-saml-provider.dto';
import { UpdateSamlProviderDto } from '../dto/update-saml-provider.dto';
import { SamlProviderIdDto } from '../dto/saml-provider-id.dto';

@UseGuards(JwtAuthGuard)
@Controller('sso/saml/providers')
export class SamlProviderController {
  constructor(
    private readonly samlProviderService: SamlProviderService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('list')
  async list(@AuthUser() user: User, @AuthWorkspace() workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
    return this.samlProviderService.list(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async create(
    @Body() dto: CreateSamlProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.samlProviderService.create(dto, user, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateSamlProviderDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    return this.samlProviderService.update(dto, workspace);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() dto: SamlProviderIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
    await this.samlProviderService.delete(dto.id, workspace);
  }
}
