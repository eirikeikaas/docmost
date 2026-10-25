import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page/page-access/page-access.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { CollectionService } from './collection.service';
import {
  CollectionInfoDto,
  CreateCollectionDto,
  CreatePropertyDto,
  CreateViewDto,
  PropertyIdDto,
  ReorderPropertyDto,
  UpdatePropertyDto,
  UpdateViewDto,
  ViewIdDto,
} from './dto/collection.dto';

@UseGuards(JwtAuthGuard)
@Controller('collections')
export class CollectionController {
  constructor(
    private readonly collectionService: CollectionService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    private readonly pageRepo: PageRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @OAuthScope('write')
  async create(
    @Body() dto: CreateCollectionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.parentPageId) {
      const parent = await this.pageRepo.findById(dto.parentPageId);
      if (!parent || parent.deletedAt || parent.spaceId !== dto.spaceId) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parent, user);
    } else {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }
    const { collection, page } = await this.collectionService.create(
      user,
      workspace,
      dto,
    );
    // The host page is returned too so the client can add the tree node.
    return {
      ...(await this.collectionService.info(collection.id, user)),
      page,
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  @OAuthScope('read')
  async info(@Body() dto: CollectionInfoDto, @AuthUser() user: User) {
    return dto.collectionId
      ? this.collectionService.info(dto.collectionId, user)
      : this.collectionService.infoByPageId(dto.pageId!, user);
  }

  // Properties

  @HttpCode(HttpStatus.OK)
  @Post('properties/create')
  @OAuthScope('write')
  createProperty(@Body() dto: CreatePropertyDto, @AuthUser() user: User) {
    return this.collectionService.createProperty(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/update')
  @OAuthScope('write')
  updateProperty(@Body() dto: UpdatePropertyDto, @AuthUser() user: User) {
    return this.collectionService.updateProperty(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/reorder')
  @OAuthScope('write')
  reorderProperty(@Body() dto: ReorderPropertyDto, @AuthUser() user: User) {
    return this.collectionService.reorderProperty(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/delete')
  @OAuthScope('write')
  async deleteProperty(@Body() dto: PropertyIdDto, @AuthUser() user: User) {
    await this.collectionService.deleteProperty(
      user,
      dto.collectionId,
      dto.propertyId,
    );
  }

  // Views

  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  @OAuthScope('write')
  createView(@Body() dto: CreateViewDto, @AuthUser() user: User) {
    return this.collectionService.createView(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/update')
  @OAuthScope('write')
  updateView(@Body() dto: UpdateViewDto, @AuthUser() user: User) {
    return this.collectionService.updateView(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/delete')
  @OAuthScope('write')
  async deleteView(@Body() dto: ViewIdDto, @AuthUser() user: User) {
    await this.collectionService.deleteView(user, dto.collectionId, dto.viewId);
  }
}
