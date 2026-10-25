import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import SCIMMY from 'scimmy';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { ScimTokenGuard } from '../guards/scim-token.guard';

interface ListQuery {
  filter?: string;
  attributes?: string;
  excludedAttributes?: string;
  sortBy?: string;
  sortOrder?: string;
  startIndex?: string;
  count?: string;
}

function parseListQuery(query: ListQuery) {
  return {
    filter: query.filter,
    attributes: query.attributes,
    excludedAttributes: query.excludedAttributes,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    startIndex: query.startIndex ? parseInt(query.startIndex, 10) : undefined,
    count: query.count ? parseInt(query.count, 10) : undefined,
  };
}

// Implements the RFC7644 HTTP endpoints on top of the resource/ingress/
// egress/degress registrations ScimResourcesRegistrar sets up at boot.
// Every route here is a thin dispatcher: build a SCIMMY Resource instance
// from the request, call its read/write/patch/dispose method with
// { workspaceId } as context, and format the result.
@UseGuards(ScimTokenGuard)
@SkipTransform()
@Controller('scim/v2')
export class ScimController {
  private readonly logger = new Logger(ScimController.name);

  @Get('ServiceProviderConfig')
  async serviceProviderConfig(@Res({ passthrough: true }) res: FastifyReply) {
    res.header('Content-Type', 'application/scim+json');
    return new SCIMMY.Resources.ServiceProviderConfig().read();
  }

  @Get('ResourceTypes')
  async resourceTypes(@Res({ passthrough: true }) res: FastifyReply) {
    res.header('Content-Type', 'application/scim+json');
    return new SCIMMY.Resources.ResourceType().read();
  }

  @Get('ResourceTypes/:name')
  async resourceType(
    @Param('name') name: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    res.header('Content-Type', 'application/scim+json');
    return new SCIMMY.Resources.ResourceType(name).read();
  }

  @Get('Schemas')
  async schemas(@Res({ passthrough: true }) res: FastifyReply) {
    res.header('Content-Type', 'application/scim+json');
    return new SCIMMY.Resources.Schema().read();
  }

  @Get('Schemas/:id')
  async schema(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    res.header('Content-Type', 'application/scim+json');
    return new SCIMMY.Resources.Schema(id).read();
  }

  @Get('Users')
  async listUsers(
    @Query() query: ListQuery,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(
      res,
      () =>
        new SCIMMY.Resources.User(undefined, parseListQuery(query)).read({
          workspaceId: workspace.id,
        }),
    );
  }

  @Post('Users')
  async createUser(
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    res.status(HttpStatus.CREATED);
    return this.dispatch(res, () =>
      new SCIMMY.Resources.User().write(body, { workspaceId: workspace.id }),
    );
  }

  @Get('Users/:id')
  async getUser(
    @Param('id') id: string,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.User(id).read({ workspaceId: workspace.id }),
    );
  }

  @Put('Users/:id')
  async replaceUser(
    @Param('id') id: string,
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.User(id).write(body, { workspaceId: workspace.id }),
    );
  }

  @Patch('Users/:id')
  async patchUser(
    @Param('id') id: string,
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.User(id).patch(body, { workspaceId: workspace.id }),
    );
  }

  @Delete('Users/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(
    @Param('id') id: string,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.dispatch(res, () =>
      new SCIMMY.Resources.User(id).dispose({ workspaceId: workspace.id }),
    );
  }

  @Get('Groups')
  async listGroups(
    @Query() query: ListQuery,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.Group(undefined, parseListQuery(query)).read({
        workspaceId: workspace.id,
      }),
    );
  }

  @Post('Groups')
  async createGroup(
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    res.status(HttpStatus.CREATED);
    return this.dispatch(res, () =>
      new SCIMMY.Resources.Group().write(body, { workspaceId: workspace.id }),
    );
  }

  @Get('Groups/:id')
  async getGroup(
    @Param('id') id: string,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.Group(id).read({ workspaceId: workspace.id }),
    );
  }

  @Put('Groups/:id')
  async replaceGroup(
    @Param('id') id: string,
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.Group(id).write(body, {
        workspaceId: workspace.id,
      }),
    );
  }

  @Patch('Groups/:id')
  async patchGroup(
    @Param('id') id: string,
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    return this.dispatch(res, () =>
      new SCIMMY.Resources.Group(id).patch(body, {
        workspaceId: workspace.id,
      }),
    );
  }

  @Delete('Groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroup(
    @Param('id') id: string,
    @AuthWorkspace() workspace: Workspace,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    await this.dispatch(res, () =>
      new SCIMMY.Resources.Group(id).dispose({ workspaceId: workspace.id }),
    );
  }

  private async dispatch<T>(
    res: FastifyReply,
    fn: () => Promise<T>,
  ): Promise<T | any> {
    res.header('Content-Type', 'application/scim+json');
    try {
      return await fn();
    } catch (err: any) {
      if (err instanceof SCIMMY.Types.Error) {
        res.status(err.status);
        return new SCIMMY.Messages.ErrorResponse(err);
      }
      this.logger.error('Unhandled SCIM error', err?.stack ?? err);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      return new SCIMMY.Messages.ErrorResponse(
        new SCIMMY.Types.Error(500, '', 'An internal error occurred'),
      );
    }
  }
}
