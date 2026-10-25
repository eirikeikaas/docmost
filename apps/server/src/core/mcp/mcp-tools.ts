import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { McpApiCaller, McpApiError } from './mcp-api.client';

type ToolResult = {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
};

const contentFormat = z.enum(['markdown', 'html', 'json']);

/** Drops undefined values so optional tool arguments are not sent as null. */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

function ok(value: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    const message =
      err instanceof McpApiError
        ? `Docmost API error ${err.status}: ${err.message}`
        : `Error: ${(err as Error).message}`;
    return { content: [{ type: 'text', text: message }], isError: true };
  }
}

function pageSummary(page: any) {
  return {
    id: page.id,
    slugId: page.slugId,
    title: page.title,
    icon: page.icon,
    spaceId: page.spaceId,
    parentPageId: page.parentPageId,
    artifactUrl: page.artifactUrl ?? null,
    updatedAt: page.updatedAt,
  };
}

export function registerDocmostTools(
  server: McpServer,
  api: McpApiCaller,
): void {
  server.registerTool(
    'list_spaces',
    {
      title: 'List spaces',
      description: 'List the Docmost spaces the current user can see.',
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    () =>
      run(async () => {
        const res: any = await api('/spaces', { limit: 100 });
        const items: any[] = res?.items ?? res ?? [];
        return items.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          projectId: s.projectId ?? null,
        }));
      }),
  );

  const projectId = z
    .string()
    .min(1)
    .describe('Marathon project id, two to four letters + four digits, e.g. FOU0002');
  const provider = z.enum(['sharepoint', 'linear', 'trylle', 'busy']);

  server.registerTool(
    'find_space_by_project',
    {
      title: 'Find space by project id',
      description:
        'Resolve the space linked to a Marathon project id, with its linked systems (SharePoint, Linear, TRYlle, Busy).',
      inputSchema: { projectId },
      annotations: { readOnlyHint: true },
    },
    ({ projectId }) => run(() => api('/spaces/by-project', { projectId })),
  );

  server.registerTool(
    'get_space_links',
    {
      title: 'Get space links',
      description:
        "Get a space's Marathon project id and its links to external systems.",
      inputSchema: { spaceId: z.string().min(1).describe('Space id or slug') },
      annotations: { readOnlyHint: true },
    },
    ({ spaceId }) => run(() => api('/spaces/links', { spaceId })),
  );

  server.registerTool(
    'set_space_project',
    {
      title: 'Set space project id',
      description:
        'Link a space to a Marathon project id. Pass an empty string to clear it. A project id can belong to only one space.',
      inputSchema: {
        spaceId: z.string().min(1).describe('Space id or slug'),
        projectId: projectId.or(z.literal('')),
      },
    },
    ({ spaceId, projectId }) =>
      run(async () => {
        const space: any = await api('/spaces/update', { spaceId, projectId });
        return { id: space.id, slug: space.slug, projectId: space.projectId };
      }),
  );

  server.registerTool(
    'set_space_link',
    {
      title: 'Set space link',
      description:
        'Create or replace a space link to an external system. A url is required for sharepoint and linear; trylle and busy are resolved from the project id and may omit it.',
      inputSchema: {
        spaceId: z.string().min(1).describe('Space id or slug'),
        provider,
        url: z.string().url().optional(),
      },
    },
    ({ spaceId, provider, url }) =>
      run(() => api('/spaces/links/set', compact({ spaceId, provider, url }))),
  );

  server.registerTool(
    'search_pages',
    {
      title: 'Search pages',
      description: 'Full-text search over pages the current user can read.',
      inputSchema: {
        query: z.string().min(1).describe('Search text'),
        spaceId: z.string().uuid().optional().describe('Limit to one space'),
        limit: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ query, spaceId, limit }) =>
      run(async () => {
        const res: any = await api('/search', compact({ query, spaceId, limit }));
        const items: any[] = res?.items ?? res ?? [];
        return items.map((p) => ({ ...pageSummary(p), highlight: p.highlight }));
      }),
  );

  server.registerTool(
    'get_page',
    {
      title: 'Get page',
      description:
        'Read a page by id or slugId. Artifact pages return artifactUrl and have no document content.',
      inputSchema: {
        pageId: z.string().min(1).describe('Page id (uuid) or slugId'),
        format: contentFormat.optional().describe('Content format; default markdown'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ pageId, format }) =>
      run(async () => {
        const page: any = await api('/pages/info', {
          pageId,
          format: format ?? 'markdown',
        });
        return {
          ...pageSummary(page),
          canEdit: page.permissions?.canEdit,
          content: page.content ?? null,
        };
      }),
  );

  server.registerTool(
    'list_child_pages',
    {
      title: 'List child pages',
      description:
        'List the direct children of a page, or the top-level pages of a space when pageId is omitted.',
      inputSchema: {
        spaceId: z.string().uuid(),
        pageId: z.string().optional().describe('Parent page id; omit for the space root'),
      },
      annotations: { readOnlyHint: true },
    },
    ({ spaceId, pageId }) =>
      run(async () => {
        const res: any = await api('/pages/sidebar-pages', compact({ spaceId, pageId }));
        const items: any[] = res?.items ?? res ?? [];
        return items.map((p) => ({ ...pageSummary(p), hasChildren: p.hasChildren }));
      }),
  );

  server.registerTool(
    'create_page',
    {
      title: 'Create page',
      description:
        'Create a page. Content is optional; when given it is parsed as the chosen format (default markdown).',
      inputSchema: {
        spaceId: z.string().uuid(),
        title: z.string().optional(),
        parentPageId: z.string().optional(),
        icon: z.string().optional().describe('An emoji'),
        content: z.string().optional(),
        format: contentFormat.optional(),
      },
    },
    ({ spaceId, title, parentPageId, icon, content, format }) =>
      run(async () => {
        const page = await api(
          '/pages/create',
          compact({
            spaceId,
            title,
            parentPageId,
            icon,
            content,
            format: content === undefined ? undefined : (format ?? 'markdown'),
          }),
        );
        return pageSummary(page);
      }),
  );

  server.registerTool(
    'create_artifact_page',
    {
      title: 'Create artifact page',
      description:
        'Create a page that embeds a published Claude artifact. artifactUrl must be an https embed URL from the artifact\'s publish dialog, with this Docmost origin in its allowed domains.',
      inputSchema: {
        spaceId: z.string().uuid(),
        artifactUrl: z.string().url().startsWith('https://').max(2048),
        title: z.string().optional(),
        parentPageId: z.string().optional(),
        icon: z.string().optional(),
      },
    },
    ({ spaceId, artifactUrl, title, parentPageId, icon }) =>
      run(async () =>
        pageSummary(
          await api(
            '/pages/create',
            compact({ spaceId, artifactUrl, title, parentPageId, icon }),
          ),
        ),
      ),
  );

  server.registerTool(
    'update_page',
    {
      title: 'Update page',
      description:
        'Update a page\'s title, icon, artifact URL and/or content. Content is appended by default; use operation "replace" to overwrite, which cannot be undone except via page history.',
      inputSchema: {
        pageId: z.string().min(1),
        title: z.string().optional(),
        icon: z.string().optional(),
        artifactUrl: z.string().url().startsWith('https://').max(2048).optional(),
        content: z.string().optional(),
        operation: z.enum(['append', 'prepend', 'replace']).optional(),
        format: contentFormat.optional(),
      },
    },
    ({ pageId, title, icon, artifactUrl, content, operation, format }) =>
      run(async () =>
        pageSummary(
          await api(
            '/pages/update',
            compact({
              pageId,
              title,
              icon,
              artifactUrl,
              content,
              operation: content === undefined ? undefined : (operation ?? 'append'),
              format: content === undefined ? undefined : (format ?? 'markdown'),
            }),
          ),
        ),
      ),
  );
}
