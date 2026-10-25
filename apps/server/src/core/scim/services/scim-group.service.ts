import { Injectable } from '@nestjs/common';
import SCIMMY from 'scimmy';
import { Group } from '@docmost/db/types/entity.types';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';

export interface ScimGroupResource {
  id: string;
  externalId?: string;
  displayName: string;
  members?: { value: string; display?: string }[];
}

// Registered against SCIMMY.Resources.Group by ScimResourcesRegistrar.
@Injectable()
export class ScimGroupService {
  constructor(
    private readonly groupRepo: GroupRepo,
    private readonly groupUserRepo: GroupUserRepo,
    private readonly userRepo: UserRepo,
  ) {}

  async egress(
    resource: any,
    ctx: { workspaceId: string },
  ): Promise<ScimGroupResource | ScimGroupResource[]> {
    if (resource.id) {
      const group = await this.groupRepo.findById(resource.id, ctx.workspaceId, {
        includeScimExternalId: true,
      });
      if (!group) {
        throw new SCIMMY.Types.Error(404, '', 'Group not found');
      }
      return this.toScimGroup(group);
    }

    const groups = await this.groupRepo.findAllByWorkspaceId(ctx.workspaceId);
    const mapped = await Promise.all(groups.map((g) => this.toScimGroup(g)));
    return resource.filter ? resource.filter.match(mapped) : mapped;
  }

  async ingress(
    resource: any,
    instance: any,
    ctx: { workspaceId: string },
  ): Promise<ScimGroupResource> {
    const displayName = instance.displayName;
    if (!displayName) {
      throw new SCIMMY.Types.Error(
        400,
        'invalidValue',
        'A displayName is required',
      );
    }

    let group: Group;
    if (resource.id) {
      const existing = await this.groupRepo.findById(
        resource.id,
        ctx.workspaceId,
      );
      if (!existing) {
        throw new SCIMMY.Types.Error(404, '', 'Group not found');
      }
      await this.groupRepo.update(
        {
          name: displayName,
          ...(instance.externalId !== undefined
            ? { scimExternalId: instance.externalId }
            : {}),
        },
        resource.id,
        ctx.workspaceId,
      );
      group = await this.groupRepo.findById(resource.id, ctx.workspaceId, {
        includeScimExternalId: true,
      });
    } else {
      const already = await this.groupRepo.findByName(
        displayName,
        ctx.workspaceId,
      );
      group =
        already ??
        (await this.groupRepo.insertGroup({
          name: displayName,
          isExternal: true,
          scimExternalId: instance.externalId,
          workspaceId: ctx.workspaceId,
        }));
    }

    if (Array.isArray(instance.members)) {
      await this.reconcileMembers(group.id, instance.members, ctx.workspaceId);
    }

    return this.toScimGroup(group);
  }

  async degress(resource: any, ctx: { workspaceId: string }): Promise<void> {
    const group = await this.groupRepo.findById(resource.id, ctx.workspaceId);
    if (!group) {
      throw new SCIMMY.Types.Error(404, '', 'Group not found');
    }
    await this.groupRepo.delete(resource.id, ctx.workspaceId);
  }

  // instance.members is the full desired membership list - whether from a
  // POST/PUT body or from SCIMMY's own generic PATCH-op application (which
  // reassembles a full instance from add/remove/replace ops before handing
  // it to ingress) - so reconciling to match it is enough; no PATCH-op
  // parsing needed here.
  private async reconcileMembers(
    groupId: string,
    members: Array<{ value: string }>,
    workspaceId: string,
  ): Promise<void> {
    const desiredUserIds = new Set(members.map((m) => m.value).filter(Boolean));
    const currentUserIds = new Set(
      await this.groupUserRepo.getUserIdsByGroupId(groupId),
    );

    for (const userId of desiredUserIds) {
      if (!currentUserIds.has(userId)) {
        const user = await this.userRepo.findById(userId, workspaceId);
        if (user) {
          await this.groupUserRepo.insertGroupUser({ userId, groupId });
        }
      }
    }

    for (const userId of currentUserIds) {
      if (!desiredUserIds.has(userId)) {
        await this.groupUserRepo.delete(userId, groupId);
      }
    }
  }

  private async toScimGroup(group: Group): Promise<ScimGroupResource> {
    const memberIds = await this.groupUserRepo.getUserIdsByGroupId(group.id);
    const members = await Promise.all(
      memberIds.map(async (userId) => {
        const user = await this.userRepo.findById(userId, group.workspaceId);
        return { value: userId, display: user?.name };
      }),
    );

    return {
      id: group.id,
      externalId: group.scimExternalId ?? undefined,
      displayName: group.name,
      members,
    };
  }
}
