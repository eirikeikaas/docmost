import { ScimGroupService } from './scim-group.service';

const ctx = { workspaceId: 'ws_1' };

function createService(overrides: Partial<Record<string, any>> = {}) {
  const groupRepo = {
    findById: jest.fn(),
    findByName: jest.fn().mockResolvedValue(undefined),
    findAllByWorkspaceId: jest.fn().mockResolvedValue([]),
    insertGroup: jest.fn(),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.groupRepo,
  };
  const groupUserRepo = {
    getUserIdsByGroupId: jest.fn().mockResolvedValue([]),
    insertGroupUser: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
    ...overrides.groupUserRepo,
  };
  const userRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'user_1', name: 'User One' }),
    ...overrides.userRepo,
  };

  const service = new ScimGroupService(groupRepo as any, groupUserRepo as any, userRepo as any);
  return { service, groupRepo, groupUserRepo, userRepo };
}

describe('ScimGroupService.ingress', () => {
  it('creates a new external group when no matching group exists', async () => {
    const { service, groupRepo } = createService({
      groupRepo: {
        insertGroup: jest.fn().mockResolvedValue({
          id: 'group_1',
          name: 'Engineering',
          workspaceId: ctx.workspaceId,
          scimExternalId: 'ext-1',
        }),
      },
    });

    const result = await service.ingress(
      {},
      { displayName: 'Engineering', externalId: 'ext-1' },
      ctx,
    );

    expect(groupRepo.insertGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Engineering',
        isExternal: true,
        scimExternalId: 'ext-1',
        workspaceId: ctx.workspaceId,
      }),
    );
    expect(result.displayName).toBe('Engineering');
  });

  it('reconciles membership to exactly match the given members list', async () => {
    const { service, groupUserRepo } = createService({
      groupRepo: {
        insertGroup: jest.fn().mockResolvedValue({
          id: 'group_1',
          name: 'Engineering',
          workspaceId: ctx.workspaceId,
        }),
      },
      groupUserRepo: {
        getUserIdsByGroupId: jest.fn().mockResolvedValue(['user_stale']),
        insertGroupUser: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      userRepo: {
        findById: jest.fn().mockResolvedValue({ id: 'user_new', name: 'New User' }),
      },
    });

    await service.ingress(
      {},
      { displayName: 'Engineering', members: [{ value: 'user_new' }] },
      ctx,
    );

    expect(groupUserRepo.insertGroupUser).toHaveBeenCalledWith({
      userId: 'user_new',
      groupId: 'group_1',
    });
    expect(groupUserRepo.delete).toHaveBeenCalledWith('user_stale', 'group_1');
  });

  it('does not add a member that does not exist in this workspace', async () => {
    const { service, groupUserRepo } = createService({
      groupRepo: {
        insertGroup: jest.fn().mockResolvedValue({ id: 'group_1', name: 'Eng', workspaceId: ctx.workspaceId }),
      },
      userRepo: { findById: jest.fn().mockResolvedValue(undefined) },
    });

    await service.ingress(
      {},
      { displayName: 'Eng', members: [{ value: 'nonexistent' }] },
      ctx,
    );

    expect(groupUserRepo.insertGroupUser).not.toHaveBeenCalled();
  });
});
