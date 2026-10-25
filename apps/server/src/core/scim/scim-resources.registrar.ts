import { Injectable, OnModuleInit } from '@nestjs/common';
import SCIMMY from 'scimmy';
import { ScimUserService } from './services/scim-user.service';
import { ScimGroupService } from './services/scim-group.service';

// SCIMMY.Resources.declare(...) registers global handlers once against the
// User/Group resource classes themselves, not per-request - this runs once
// at boot. Per-request context (which workspace) is threaded through the
// `ctx` parameter each controller call passes to resource.read/write/
// patch/dispose, not through anything registered here.
@Injectable()
export class ScimResourcesRegistrar implements OnModuleInit {
  constructor(
    private readonly scimUserService: ScimUserService,
    private readonly scimGroupService: ScimGroupService,
  ) {}

  onModuleInit() {
    SCIMMY.Config.set({
      patch: { supported: true },
      bulk: { supported: false },
      filter: { supported: true, maxResults: 1000 },
      changePassword: { supported: false },
      sort: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'Bearer Token',
          description: 'Authentication scheme using a SCIM bearer token',
        },
      ],
    });

    SCIMMY.Resources.declare(SCIMMY.Resources.User)
      .ingress((resource: any, instance: any, ctx: any) =>
        this.scimUserService.ingress(resource, instance, ctx),
      )
      .egress((resource: any, ctx: any) =>
        this.scimUserService.egress(resource, ctx),
      )
      .degress((resource: any, ctx: any) =>
        this.scimUserService.degress(resource, ctx),
      );

    SCIMMY.Resources.declare(SCIMMY.Resources.Group)
      .ingress((resource: any, instance: any, ctx: any) =>
        this.scimGroupService.ingress(resource, instance, ctx),
      )
      .egress((resource: any, ctx: any) =>
        this.scimGroupService.egress(resource, ctx),
      )
      .degress((resource: any, ctx: any) =>
        this.scimGroupService.degress(resource, ctx),
      );
  }
}
