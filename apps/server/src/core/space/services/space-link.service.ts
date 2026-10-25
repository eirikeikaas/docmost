import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { SpaceLinkRepo } from '@docmost/db/repos/space/space-link.repo';
import { SpaceLink } from '@docmost/db/types/entity.types';
import { AuditEvent, AuditResource } from '../../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../../integrations/audit/audit.service';
import { SetSpaceLinkDto } from '../dto/space-link.dto';
import { PROJECT_ID_ONLY_PROVIDERS, SpaceLinkProvider } from '../space-links';

@Injectable()
export class SpaceLinkService {
  constructor(
    private readonly spaceLinkRepo: SpaceLinkRepo,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  list(spaceId: string, workspaceId: string): Promise<SpaceLink[]> {
    return this.spaceLinkRepo.listBySpace(spaceId, workspaceId);
  }

  /**
   * Creates or replaces the link for one provider. SharePoint and Linear are
   * addressed by URL; TRYlle and Busy are addressed by the space's project id
   * and may omit it.
   */
  async set(
    dto: SetSpaceLinkDto,
    spaceId: string,
    workspaceId: string,
  ): Promise<SpaceLink> {
    const needsUrl = !PROJECT_ID_ONLY_PROVIDERS.includes(dto.provider);
    if (needsUrl && !dto.url) {
      throw new BadRequestException(`A url is required for ${dto.provider}`);
    }

    const link = await this.spaceLinkRepo.upsert({
      spaceId,
      workspaceId,
      provider: dto.provider,
      url: dto.url ?? null,
      externalId: dto.externalId ?? null,
    });
    this.audit(spaceId, { after: { link: { provider: dto.provider, url: link.url } } });
    return link;
  }

  async remove(
    spaceId: string,
    workspaceId: string,
    provider: SpaceLinkProvider,
  ): Promise<void> {
    await this.spaceLinkRepo.remove(spaceId, workspaceId, provider);
    this.audit(spaceId, { before: { link: { provider } } });
  }

  private audit(
    spaceId: string,
    changes: { before?: Record<string, any>; after?: Record<string, any> },
  ) {
    this.auditService.log({
      event: AuditEvent.SPACE_UPDATED,
      resourceType: AuditResource.SPACE,
      resourceId: spaceId,
      spaceId,
      changes: { before: changes.before ?? {}, after: changes.after ?? {} },
    });
  }
}
