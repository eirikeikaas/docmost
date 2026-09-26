import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import { generateServiceProviderMetadata } from '@node-saml/node-saml';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  SSO_SAML_THROTTLER,
} from '../../../integrations/throttle/throttler-names';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { EncryptionService } from '../../../integrations/encryption/encryption.service';
import { SamlClientRegistryService } from '../services/saml-client-registry.service';
import { SsoLoginService } from '../services/sso-login.service';
import { isSafeRedirectPath } from '../sso.util';
import { SAML_STATE_COOKIE, SAML_STATE_TTL_SECONDS } from '../sso.constants';

interface SamlStatePayload {
  v: 1;
  providerId: string;
  redirectPath?: string;
  issuedAt: number;
}

// Public, browser-navigated endpoints. Like the OIDC controller, the ACS
// callback is a single global path - the provider identity is recovered
// only from the RelayState, which is itself bound to an httpOnly cookie
// (see callback() below) so a captured SAMLResponse+RelayState pair from an
// attacker's own login can't be replayed against a victim's browser
// (a "login CSRF"/session-fixation risk SAML SPs are historically prone
// to). node-saml's own InResponseTo check (backed by the Redis-shared
// SamlReplayCacheProvider, not its default in-memory one) additionally
// guards against a response being reused for a request this server never
// issued.
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [SSO_SAML_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('sso/saml')
export class SsoSamlController {
  private readonly logger = new Logger(SsoSamlController.name);

  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly samlClientRegistry: SamlClientRegistryService,
    private readonly ssoLoginService: SsoLoginService,
    private readonly environmentService: EnvironmentService,
    private readonly encryptionService: EncryptionService,
  ) {}

  @SkipTransform()
  @Get('metadata')
  async metadata(@Res({ passthrough: true }) res: FastifyReply) {
    const xml = generateServiceProviderMetadata({
      issuer: this.samlClientRegistry.spEntityId(),
      callbackUrl: this.samlClientRegistry.callbackUrl(),
    });
    res.header('Content-Type', 'application/xml');
    return xml;
  }

  @Get(':providerId/login')
  async login(
    @Param('providerId', ParseUUIDPipe) providerId: string,
    @Query('redirect') redirectParam: string | undefined,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const provider = await this.authProviderRepo.findEnabledById(
      providerId,
      workspace.id,
      'saml',
    );
    if (!provider) {
      throw new NotFoundException('SSO provider not found');
    }

    const saml = this.samlClientRegistry.getClient(provider);
    const redirectPath = isSafeRedirectPath(redirectParam) ?? undefined;

    const payload: SamlStatePayload = {
      v: 1,
      providerId,
      redirectPath,
      issuedAt: Date.now(),
    };
    // Note: this sealed value also doubles as RelayState, which the SAML
    // spec recommends keeping under 80 bytes - some strict IdPs may reject
    // a longer value. Most major IdPs (Okta, Entra, Google) tolerate it in
    // practice; a spec-strict fix would swap this for a short opaque token
    // resolved server-side, left as a follow-up.
    const sealed = this.encryptionService.encrypt(JSON.stringify(payload));

    res.setCookie(SAML_STATE_COOKIE, sealed, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/sso/saml',
      secure: this.environmentService.isHttps(),
      maxAge: SAML_STATE_TTL_SECONDS,
    });

    const url = await saml.getAuthorizeUrlAsync(sealed, undefined, {});
    res.redirect(url, 302);
  }

  @Post('callback')
  async callback(
    @Body() body: Record<string, string>,
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const cookieValue = (req.cookies as Record<string, string> | undefined)?.[
      SAML_STATE_COOKIE
    ];
    res.clearCookie(SAML_STATE_COOKIE, { path: '/api/sso/saml' });

    // The cookie must exist and match the RelayState the IdP echoed back
    // exactly - this is what ties the response to the browser that actually
    // initiated this specific login attempt.
    if (!cookieValue || !body.RelayState || cookieValue !== body.RelayState) {
      throw new BadRequestException(
        'Login session expired, please try again',
      );
    }

    let attempt: SamlStatePayload;
    try {
      attempt = JSON.parse(this.encryptionService.decrypt(cookieValue));
    } catch {
      throw new BadRequestException('Invalid login session');
    }

    if (Date.now() - attempt.issuedAt > SAML_STATE_TTL_SECONDS * 1000) {
      throw new BadRequestException(
        'Login session expired, please try again',
      );
    }

    const provider = await this.authProviderRepo.findEnabledById(
      attempt.providerId,
      workspace.id,
      'saml',
    );
    if (!provider) {
      throw new BadRequestException('SSO provider no longer available');
    }

    const saml = this.samlClientRegistry.getClient(provider);

    let profile: Awaited<
      ReturnType<typeof saml.validatePostResponseAsync>
    >['profile'];
    try {
      const result = await saml.validatePostResponseAsync(body);
      if (result.loggedOut) {
        // An IdP-initiated logout response, not a login - out of scope.
        throw new BadRequestException('SSO login failed');
      }
      profile = result.profile;
    } catch (err: any) {
      this.logger.warn(
        `SAML callback rejected for provider ${provider.id}: ${err?.message}`,
      );
      throw new BadRequestException('SSO login failed');
    }

    if (!profile?.nameID) {
      throw new BadRequestException('SSO login failed');
    }

    const email = String(profile.email ?? profile.mail ?? '')
      .toLowerCase()
      .trim();
    if (!email) {
      throw new BadRequestException(
        'Your identity provider did not share an email address',
      );
    }

    const user = await this.ssoLoginService.resolveOrProvisionUser(
      provider,
      workspace,
      {
        providerUserId: profile.nameID,
        email,
        // Unlike OIDC's explicit email_verified claim, SAML has no separate
        // "unverified" concept: the entire assertion (including this email
        // attribute) is cryptographically signed by the IdP, which
        // validatePostResponseAsync has already verified above. That
        // signature IS the verification.
        emailVerified: true,
        name: undefined,
      },
    );

    const authToken = await this.ssoLoginService.issueSession(user, 'saml');
    res.setCookie('authToken', authToken, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });

    res.redirect(
      `${this.environmentService.getAppUrl()}${attempt.redirectPath ?? '/home'}`,
      302,
    );
  }
}
