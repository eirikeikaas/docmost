import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { McpApiError, createLoopbackApiCaller } from './mcp-api.client';
import { registerDocmostTools } from './mcp-tools';

const SPACE_ID = '0192d3a0-0000-7000-8000-000000000001';

async function connect(api: jest.Mock) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerDocmostTools(server, api);
  const client = new Client({ name: 'client', version: '0.0.0' });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return client;
}

function text(result: any): string {
  return result.content[0].text;
}

describe('docmost MCP tools', () => {
  it('exposes the expected tools', async () => {
    const client = await connect(jest.fn());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'create_artifact_page',
      'create_page',
      'get_page',
      'list_child_pages',
      'list_spaces',
      'search_pages',
      'update_page',
    ]);
  });

  it('marks read tools read-only and leaves write tools unmarked', async () => {
    const client = await connect(jest.fn());
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.get_page.annotations?.readOnlyHint).toBe(true);
    expect(byName.search_pages.annotations?.readOnlyHint).toBe(true);
    expect(byName.create_page.annotations?.readOnlyHint).toBeUndefined();
  });

  it('create_artifact_page posts artifactUrl and omits unset fields', async () => {
    const api = jest.fn().mockResolvedValue({
      id: 'p1',
      slugId: 's1',
      title: 'Demo',
      spaceId: SPACE_ID,
      artifactUrl: 'https://claude.ai/embed/x',
    });
    const client = await connect(api);

    const res = await client.callTool({
      name: 'create_artifact_page',
      arguments: {
        spaceId: SPACE_ID,
        artifactUrl: 'https://claude.ai/embed/x',
        title: 'Demo',
      },
    });

    expect(api).toHaveBeenCalledWith('/pages/create', {
      spaceId: SPACE_ID,
      artifactUrl: 'https://claude.ai/embed/x',
      title: 'Demo',
    });
    expect(JSON.parse(text(res)).artifactUrl).toBe('https://claude.ai/embed/x');
  });

  it('rejects a non-https artifactUrl before calling the API', async () => {
    const api = jest.fn();
    const client = await connect(api);

    const res: any = await client
      .callTool({
        name: 'create_artifact_page',
        arguments: { spaceId: SPACE_ID, artifactUrl: 'http://example.com/x' },
      })
      .catch((e) => ({ isError: true, thrown: e }));

    expect(res.isError).toBe(true);
    expect(api).not.toHaveBeenCalled();
  });

  it('update_page defaults to append/markdown only when content is given', async () => {
    const api = jest.fn().mockResolvedValue({ id: 'p1' });
    const client = await connect(api);

    await client.callTool({
      name: 'update_page',
      arguments: { pageId: 'p1', title: 'New' },
    });
    expect(api).toHaveBeenLastCalledWith('/pages/update', {
      pageId: 'p1',
      title: 'New',
    });

    await client.callTool({
      name: 'update_page',
      arguments: { pageId: 'p1', content: '# hi' },
    });
    expect(api).toHaveBeenLastCalledWith('/pages/update', {
      pageId: 'p1',
      content: '# hi',
      operation: 'append',
      format: 'markdown',
    });
  });

  it('get_page requests markdown by default and returns the content', async () => {
    const api = jest.fn().mockResolvedValue({
      id: 'p1',
      title: 'T',
      content: '# T',
      permissions: { canEdit: true },
    });
    const client = await connect(api);

    const res = await client.callTool({
      name: 'get_page',
      arguments: { pageId: 'p1' },
    });

    expect(api).toHaveBeenCalledWith('/pages/info', {
      pageId: 'p1',
      format: 'markdown',
    });
    expect(JSON.parse(text(res))).toMatchObject({ content: '# T', canEdit: true });
  });

  it('surfaces API errors as tool errors instead of throwing', async () => {
    const api = jest.fn().mockRejectedValue(new McpApiError(403, 'Forbidden'));
    const client = await connect(api);

    const res: any = await client.callTool({
      name: 'create_page',
      arguments: { spaceId: SPACE_ID, title: 'x' },
    });

    expect(res.isError).toBe(true);
    expect(text(res)).toBe('Docmost API error 403: Forbidden');
  });
});

describe('createLoopbackApiCaller', () => {
  const jsonResponse = (status: number, body: unknown) =>
    ({
      ok: status < 400,
      status,
      statusText: 'x',
      text: async () => JSON.stringify(body),
    }) as unknown as Response;

  it('forwards the caller token, posts JSON, and unwraps { data }', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { id: 1 }, success: true }));
    const call = createLoopbackApiCaller({
      baseUrl: 'http://127.0.0.1:3000',
      authorization: 'Bearer tok',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(call('/pages/info', { pageId: 'a' })).resolves.toEqual({ id: 1 });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/pages/info',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer tok' }),
        body: JSON.stringify({ pageId: 'a' }),
      }),
    );
  });

  it('throws McpApiError with the joined validation messages', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        jsonResponse(400, { message: ['a is bad', 'b is bad'] }),
      );
    const call = createLoopbackApiCaller({
      baseUrl: 'http://x',
      authorization: 'Bearer t',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(call('/pages/create')).rejects.toMatchObject({
      status: 400,
      message: 'a is bad; b is bad',
    });
  });
});
