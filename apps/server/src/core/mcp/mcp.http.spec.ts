import 'reflect-metadata';
import { createServer, IncomingMessage, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';

// The MCP route end to end over real HTTP: Fastify + hijack + the SDK's
// Streamable HTTP transport, with a fake Docmost API behind the loopback.

describe('MCP HTTP endpoint', () => {
  let app: NestFastifyApplication;
  let fakeApi: Server;
  let appUrl: string;
  let enabled = true;
  const apiCalls: { url: string; authorization?: string; body: any }[] = [];

  beforeAll(async () => {
    fakeApi = createServer((req: IncomingMessage, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        apiCalls.push({
          url: req.url ?? '',
          authorization: req.headers.authorization,
          body: raw ? JSON.parse(raw) : undefined,
        });
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            data: { items: [{ id: 's1', name: 'Docs', slug: 'docs' }] },
            success: true,
            status: 200,
          }),
        );
      });
    });
    await new Promise<void>((r) => fakeApi.listen(0, '127.0.0.1', r));
    const fakePort = (fakeApi.address() as AddressInfo).port;

    const moduleRef = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpService,
        {
          provide: EnvironmentService,
          useValue: {
            isMcpServerEnabled: () => enabled,
            getPort: () => fakePort,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    await app.listen(0, '127.0.0.1');
    appUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise((r) => fakeApi.close(r));
  });

  beforeEach(() => {
    apiCalls.length = 0;
    enabled = true;
  });

  it('serves tools and forwards the caller token to the API', async () => {
    const client = new Client({ name: 't', version: '0' });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${appUrl}/mcp`), {
        requestInit: { headers: { authorization: 'Bearer abc.def.ghi' } },
      }),
    );

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('create_artifact_page');

    const res: any = await client.callTool({
      name: 'list_spaces',
      arguments: {},
    });
    expect(JSON.parse(res.content[0].text)).toEqual([
      { id: 's1', name: 'Docs', slug: 'docs' },
    ]);

    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0].url).toBe('/api/spaces');
    expect(apiCalls[0].authorization).toBe('Bearer abc.def.ghi');
    await client.close();
  });

  it('answers 401 without a bearer token', async () => {
    const res = await fetch(`${appUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    expect(res.status).toBe(401);
    expect(apiCalls).toHaveLength(0);
  });

  it('is a 404 when MCP_SERVER_ENABLED is off', async () => {
    enabled = false;
    const res = await fetch(`${appUrl}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer x',
      },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });

  it('answers 405 to GET (stateless server)', async () => {
    const res = await fetch(`${appUrl}/mcp`, {
      headers: { authorization: 'Bearer x' },
    });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });
});
