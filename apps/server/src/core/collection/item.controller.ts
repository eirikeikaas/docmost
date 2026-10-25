import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { CollectionService } from './collection.service';
import {
  CreateItemDto,
  ItemIdDto,
  ListItemsDto,
  MoveItemDto,
  UpdateItemDto,
} from './dto/collection.dto';

@UseGuards(JwtAuthGuard)
@Controller('items')
export class ItemController {
  constructor(private readonly collectionService: CollectionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('list')
  @OAuthScope('read')
  list(@Body() dto: ListItemsDto, @AuthUser() user: User) {
    return this.collectionService.listItems(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  @OAuthScope('write')
  create(
    @Body() dto: CreateItemDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.collectionService.createItem(user, workspace, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  @OAuthScope('write')
  update(@Body() dto: UpdateItemDto, @AuthUser() user: User) {
    return this.collectionService.updateItem(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('move')
  @OAuthScope('write')
  move(@Body() dto: MoveItemDto, @AuthUser() user: User) {
    return this.collectionService.moveItem(user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  @OAuthScope('write')
  async delete(@Body() dto: ItemIdDto, @AuthUser() user: User) {
    await this.collectionService.deleteItem(user, dto.itemId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restore')
  @OAuthScope('write')
  restore(@Body() dto: ItemIdDto, @AuthUser() user: User) {
    return this.collectionService.restoreItem(user, dto.itemId);
  }
}
