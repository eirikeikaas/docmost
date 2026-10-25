import {
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OAuthScope } from '../../common/decorators/oauth-scope.decorator';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { extractBearerTokenFromHeader } from '../../common/helpers';
import { McpService } from './mcp.service';

/**
 * Docmost's own MCP server, served at POST /api/mcp (Streamable HTTP,
 * stateless). Independent of the enterprise /mcp route and of the
 * `settings.ai.mcp` workspace flag; it is switched on with MCP_SERVER_ENABLED.
 *
 * Authentication is a bearer token (service token or OAuth access token). The
 * token is forwarded to the regular API for every tool call, so tool calls are
 * authorised exactly like the equivalent API request. Individual OAuth scopes
 * are enforced by those API routes; this route only needs to be readable.
 */
@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly mcpService: McpService,
  ) {}

  private assertEnabled() {
    if (!this.environmentService.isMcpServerEnabled()) {
      throw new NotFoundException();
    }
  }

  @Post()
  @OAuthScope('read')
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    this.assertEnabled();

    const token = extractBearerTokenFromHeader(req);
    if (!token) {
      return reply.status(401).send({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'A bearer token is required' },
        id: null,
      });
    }

    // The MCP transport writes to the raw Node response itself.
    reply.hijack();
    await this.mcpService.handleRequest(
      req.raw,
      reply.raw,
      req.body,
      `Bearer ${token}`,
    );
  }

  // Stateless server: no standalone SSE stream and no sessions to terminate.
  @Get()
  @OAuthScope('read')
  async get(@Res() reply: FastifyReply) {
    this.assertEnabled();
    return this.methodNotAllowed(reply);
  }

  @Delete()
  @OAuthScope('read')
  async delete(@Res() reply: FastifyReply) {
    this.assertEnabled();
    return this.methodNotAllowed(reply);
  }

  private methodNotAllowed(reply: FastifyReply) {
    return reply
      .status(405)
      .header('allow', 'POST')
      .send({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed' },
        id: null,
      });
  }
}
