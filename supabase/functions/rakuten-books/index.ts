const RAKUTEN_API_BASE_URL = 'https://openapi.rakuten.co.jp/services/api';
const DEFAULT_REFERER = 'https://github.com/ohagi-24022/BookNest';

declare const Deno: {
  env: {
    get: (key: string) => string | undefined;
  };
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
};

type RakutenProxyRequest = {
  path?: string;
  params?: Record<string, string>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const appId = Deno.env.get('RAKUTEN_APP_ID');
    const accessKey = Deno.env.get('RAKUTEN_ACCESS_KEY');
    const referer = Deno.env.get('RAKUTEN_REFERER') ?? DEFAULT_REFERER;

    if (!appId || !accessKey) {
      return jsonResponse({
        ok: false,
        status: 500,
        body: { error: 'RAKUTEN_APP_ID and RAKUTEN_ACCESS_KEY are required.' },
      });
    }

    const payload = (await request.json()) as RakutenProxyRequest;
    const path = payload.path;
    if (!path || !/^Books(?:Book|Total)\/Search\/20170404$/.test(path)) {
      return jsonResponse({
        ok: false,
        status: 400,
        body: { error: 'Invalid Rakuten API path.' },
      });
    }

    const params = new URLSearchParams(payload.params ?? {});
    params.set('applicationId', appId);
    params.set('accessKey', accessKey);
    params.set('format', 'json');

    const response = await fetch(`${RAKUTEN_API_BASE_URL}/${path}?${params.toString()}`, {
      headers: [['Referer', referer]],
      referrer: referer,
    } as RequestInit);
    const text = await response.text();
    let body: unknown = text;

    try {
      body = JSON.parse(text);
    } catch {
      // Keep non-JSON error bodies visible to the app debug modal.
    }

    return jsonResponse({
      ok: response.ok,
      status: response.status,
      body,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      status: 500,
      body: { error: error instanceof Error ? error.message : 'Unknown error' },
    });
  }
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}
