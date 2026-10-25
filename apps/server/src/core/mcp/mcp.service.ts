import { Injectable } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { createLoopbackApiCaller, McpApiCaller } from './mcp-api.client';
import { registerDocmostTools } from './mcp-tools';

@Injectable()
export class McpService {
  constructor(private readonly environmentService: EnvironmentService) {}

  createServer(api: McpApiCaller): McpServer {
    const server = new McpServer({ name: 'docmost', version: '1.0.0' });
    registerDocmostTools(server, api);
    return server;
  }

  /**
   * Stateless Streamable HTTP: a fresh server and transport per request, so
   * nothing is shared between callers and each request carries its own token.
   */
  async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
    body: unknown,
    authorization: string,
  ): Promise<void> {
    const api = createLoopbackApiCaller({
      baseUrl: `http://127.0.0.1:${this.environmentService.getPort()}`,
      authorization,
    });

    const server = this.createServer(api);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }
}
