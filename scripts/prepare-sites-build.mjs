import fs from 'node:fs/promises';

const serverDir = new URL('../dist/server/', import.meta.url);
await fs.mkdir(serverDir, { recursive: true });

const worker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);

    if (
      response.status !== 404 ||
      request.method !== 'GET' ||
      !request.headers.get('accept')?.includes('text/html')
    ) {
      return response;
    }

    const fallbackUrl = new URL('/index.html', request.url);
    return env.ASSETS.fetch(new Request(fallbackUrl, request));
  },
};
`;

await fs.writeFile(new URL('index.js', serverDir), worker, 'utf8');
