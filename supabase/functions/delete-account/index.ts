// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405);
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse({ ok: false, error: 'Supabase service role key is not configured.' }, 500);
    }

    const token = getBearerToken(request);
    if (!token) {
      return jsonResponse({ ok: false, error: 'ログイン情報を確認できませんでした。' }, 401);
    }

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse({ ok: false, error: 'ログイン情報の有効期限が切れています。再ログインしてください。' }, 401);
    }

    const userId = userData.user.id;

    await deleteUserRows('notification_logs', userId);
    await deleteUserRows('push_tokens', userId);
    await deleteUserRows('series_subscriptions', userId);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId);
    if (deleteError) {
      throw deleteError;
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    return jsonResponse({ ok: false, error: describeError(error) }, 500);
  }
});

function getBearerToken(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? '';
}

async function deleteUserRows(tableName: string, userId: string) {
  const { error } = await supabase.from(tableName).delete().eq('user_id', userId);
  if (error) {
    throw new Error(`${tableName}: ${describeError(error)}`);
  }
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const record = error as Record<string, unknown>;
    const parts = [
      record.message,
      record.code ? `code: ${record.code}` : null,
      record.details ? `details: ${record.details}` : null,
      record.hint ? `hint: ${record.hint}` : null,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(' / ');

    try {
      return JSON.stringify(record);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
