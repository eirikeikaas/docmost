import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, ThrottlerGuard } from '@nestjs/throttler';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  fetchUserInfo,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import {
  ALL_NAMED_THROTTLERS_SKIPPED,
  SSO_OIDC_THROTTLER,
} from '../../../integrations/throttle/throttler-names';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { AuthProviderRepo } from '@docmost/db/repos/auth-provider/auth-provider.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { EncryptionService } from '../../../integrations/encryption/encryption.service';
import { OidcClientRegistryService } from '../services/oidc-client-registry.service';
import { SsoLoginService } from '../services/sso-login.service';
import {
  extractClaimValues,
  isSafeRedirectPath,
  resolveEmailFromClaims,
} from '../sso.util';
import { parseOidcProviderSettings } from '../oidc-provider-settings';
import { OIDC_STATE_COOKIE, OIDC_STATE_TTL_SECONDS } from '../sso.constants';

interface OidcStatePayload {
  v: 1;
  providerId: string;
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectPath?: string;
  issuedAt: number;
}

// Public, browser-navigated endpoints - no JwtAuthGuard here. The callback
// is intentionally a single global path (no :providerId): the provider
// identity is recovered exclusively from the encrypted state cookie set by
// login(), never from anything URL-supplied, so there's no way to validate
// a token against a provider other than the one that actually issued it.
@SkipThrottle({ ...ALL_NAMED_THROTTLERS_SKIPPED, [SSO_OIDC_THROTTLER]: false })
@UseGuards(ThrottlerGuard)
@Controller('sso/oidc')
export class SsoOidcController {
  private readonly logger = new Logger(SsoOidcController.name);

  constructor(
    private readonly authProviderRepo: AuthProviderRepo,
    private readonly oidcClientRegistry: OidcClientRegistryService,
    private readonly ssoLoginService: SsoLoginService,
    private readonly environmentService: EnvironmentService,
    private readonly encryptionService: EncryptionService,
  ) {}

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
      'oidc',
      { includeSecret: true },
    );
    if (!provider) {
      throw new NotFoundException('SSO provider not found');
    }

    const config = await this.oidcClientRegistry.getConfig(provider);

    const state = randomState();
    const nonce = randomNonce();
    const codeVerifier = randomPKCECodeVerifier();
    const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
    const redirectPath = isSafeRedirectPath(redirectParam) ?? undefined;

    const payload: OidcStatePayload = {
      v: 1,
      providerId,
      state,
      nonce,
      codeVerifier,
      redirectPath,
      issuedAt: Date.now(),
    };
    const sealed = this.encryptionService.encrypt(JSON.stringify(payload));

    res.setCookie(OIDC_STATE_COOKIE, sealed, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/api/sso/oidc',
      secure: this.environmentService.isHttps(),
      maxAge: OIDC_STATE_TTL_SECONDS,
    });

    const supportsPkce = config.serverMetadata().supportsPKCE('S256');
    const url = buildAuthorizationUrl(config, {
      redirect_uri: this.buildRedirectUri(),
      scope: 'openid email profile',
      state,
      nonce,
      ...(supportsPkce
        ? { code_challenge: codeChallenge, code_challenge_method: 'S256' }
        : {}),
    });

    res.redirect(url.href, 302);
  }

  @Get('callback')
  async callback(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const raw = (req.cookies as Record<string, string> | undefined)?.[
      OIDC_STATE_COOKIE
    ];
    res.clearCookie(OIDC_STATE_COOKIE, { path: '/api/sso/oidc' });

    if (!raw) {
      throw new BadRequestException(
        'Login session expired, please try again',
      );
    }

    let attempt: OidcStatePayload;
    try {
      attempt = JSON.parse(this.encryptionService.decrypt(raw));
    } catch {
      throw new BadRequestException('Invalid login session');
    }

    if (Date.now() - attempt.issuedAt > OIDC_STATE_TTL_SECONDS * 1000) {
      throw new BadRequestException(
        'Login session expired, please try again',
      );
    }

    const provider = await this.authProviderRepo.findEnabledById(
      attempt.providerId,
      workspace.id,
      'oidc',
      { includeSecret: true },
    );
    if (!provider) {
      throw new BadRequestException('SSO provider no longer available');
    }

    const config = await this.oidcClientRegistry.getConfig(provider);
    const currentUrl = new URL(req.url, this.environmentService.getAppUrl());

    let tokens: Awaited<ReturnType<typeof authorizationCodeGrant>>;
    try {
      tokens = await authorizationCodeGrant(config, currentUrl, {
        expectedState: attempt.state,
        expectedNonce: attempt.nonce,
        pkceCodeVerifier: attempt.codeVerifier,
        idTokenExpected: true,
      });
    } catch (err: any) {
      this.logger.warn(
        `OIDC callback rejected for provider ${provider.id}: ${err?.message}`,
      );
      throw new BadRequestException('SSO login failed');
    }

    const idClaims = tokens.claims() as Record<string, any> | undefined;
    if (!idClaims?.sub) {
      throw new BadRequestException('SSO login failed');
    }

    let userInfo: Record<string, any> | undefined;
    try {
      userInfo = (await fetchUserInfo(
        config,
        tokens.access_token,
        idClaims.sub,
      )) as Record<string, any>;
    } catch {
      // Some IdPs have no userinfo endpoint (or, like Microsoft Entra, return
      // a different sub for it) - the signed ID token claims are enough.
    }

    // `email` first, then - for IdPs such as Microsoft Entra that often omit it
    // from the ID token - preferred_username and upn, accepting only values
    // that look like an address.
    const resolvedEmail = resolveEmailFromClaims([userInfo, idClaims]);
    if (!resolvedEmail) {
      throw new BadRequestException(
        'Your identity provider did not share an email address',
      );
    }
    const { email } = resolvedEmail;
    // email_verified describes the `email` claim only; an address taken from
    // preferred_username/upn is never "verified" by the IdP. Whether such an
    // address is accepted anyway is the provider's trustUnverifiedEmail
    // setting, enforced in the login service.
    const emailVerified =
      resolvedEmail.claim === 'email' &&
      (userInfo?.email_verified ?? idClaims.email_verified) === true;
    const name = (userInfo?.name ?? idClaims.name) as string | undefined;

    // Roles come from the signed ID token; userinfo is consulted only when the
    // ID token does not carry the claim at all.
    const { roleClaim } = parseOidcProviderSettings(provider.settings);
    const roles =
      extractClaimValues(idClaims, roleClaim) ??
      extractClaimValues(userInfo, roleClaim) ??
      [];

    const user = await this.ssoLoginService.resolveOrProvisionUser(
      provider,
      workspace,
      {
        providerUserId: String(idClaims.sub),
        email,
        emailVerified,
        name,
        roles,
      },
    );

    const authToken = await this.ssoLoginService.issueSession(user, 'oidc');
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

  private buildRedirectUri(): string {
    return `${this.environmentService.getAppUrl()}/api/sso/oidc/callback`;
  }
}
