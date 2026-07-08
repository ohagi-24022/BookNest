// @ts-nocheck
import { createClient } from 'npm:@supabase/supabase-js@2';

type SubscriptionRow = {
  id: string;
  latest_known_volume: number | null;
  series_key: string;
  series_title: string;
  user_id: string;
};

type PushTokenRow = {
  expo_push_token: string;
  user_id: string;
};

type RakutenBooksResponse = {
  Items?: Array<{
    Item?: {
      title?: string;
    };
  }>;
};

type RakutenProxyResponse = {
  body: RakutenBooksResponse | unknown;
  ok: boolean;
  status: number;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
  JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
const FUNCTION_SECRET =
  SUPABASE_SERVICE_ROLE_KEY ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await safeJson(request);
    const limit = Number.isFinite(body.limit) ? Math.min(Math.max(body.limit, 1), 50) : 20;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(
        {
          checked: [],
          error: 'SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が Edge Function に設定されていません。',
          ok: false,
        },
        200,
      );
    }

    const { data: subscriptions, error } = await supabase
      .from('series_subscriptions')
      .select('id,user_id,series_key,series_title,latest_known_volume')
      .eq('enabled', true)
      .order('updated_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    const checked: Array<{
      latestVolume: number | null;
      notified: number;
      seriesTitle: string;
      error?: string;
    }> = [];

    for (const subscription of (subscriptions ?? []) as SubscriptionRow[]) {
      try {
        const latestVolume = await lookupLatestSeriesVolume(subscription.series_title);
        const { error: checkError } = await supabase.from('publication_checks').insert({
          latest_volume: latestVolume,
          series_key: subscription.series_key,
          series_title: subscription.series_title,
          source: latestVolume ? 'Rakuten Books' : null,
        });
        if (checkError) throw checkError;

        if (!latestVolume || latestVolume <= (subscription.latest_known_volume ?? 0)) {
          checked.push({
            latestVolume,
            notified: 0,
            seriesTitle: subscription.series_title,
          });
          continue;
        }

        const notified = await notifyUser(subscription, latestVolume);
        const { error: updateError } = await supabase
          .from('series_subscriptions')
          .update({
            latest_known_volume: latestVolume,
            updated_at: new Date().toISOString(),
          })
          .eq('id', subscription.id);
        if (updateError) throw updateError;

        checked.push({
          latestVolume,
          notified,
          seriesTitle: subscription.series_title,
        });
      } catch (subscriptionError) {
        checked.push({
          error: describeError(subscriptionError),
          latestVolume: null,
          notified: 0,
          seriesTitle: subscription.series_title,
        });
      }
    }

    return jsonResponse({ checked, ok: true });
  } catch (error) {
    return jsonResponse(
      { checked: [], error: describeError(error), ok: false },
      200,
    );
  }
});

async function safeJson(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

async function lookupLatestSeriesVolume(seriesTitle: string) {
  const params = {
    hits: '30',
    outOfStockFlag: '1',
    size: '9',
    sort: '-releaseDate',
    title: seriesTitle,
  };
  const response = await fetch(`${SUPABASE_URL}/functions/v1/rakuten-books`, {
    body: JSON.stringify({
      params,
      path: 'BooksBook/Search/20170404',
    }),
    headers: {
      Authorization: `Bearer ${FUNCTION_SECRET}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as RakutenProxyResponse;
  if (!payload.ok || !isRakutenBooksResponse(payload.body)) return null;

  const volumes = payload.body.Items
    ?.map((entry) => entry.Item?.title)
    .map((title) => (title ? parseVolumeNumber(title) : null))
    .filter((volume): volume is number => !!volume && volume > 0 && volume <= 500);

  return volumes && volumes.length > 0 ? Math.max(...volumes) : null;
}

function isRakutenBooksResponse(value: unknown): value is RakutenBooksResponse {
  return typeof value === 'object' && value !== null && Array.isArray((value as RakutenBooksResponse).Items);
}

function parseVolumeNumber(title: string) {
  const normalized = title.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const patterns = [
    /(?:第\s*)?([0-9]{1,3})\s*巻/,
    /(?:^|[\s:：\-–—])([0-9]{1,3})(?=$|[\s(（【「『〈<])/,
    /[(（【「『〈<]\s*(?:第\s*)?([0-9]{1,3})\s*(?:巻)?/,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (match?.[1]) return Number.parseInt(match[1], 10);
  }
  return null;
}

async function notifyUser(subscription: SubscriptionRow, latestVolume: number) {
  const { data: tokens, error } = await supabase
    .from('push_tokens')
    .select('user_id,expo_push_token')
    .eq('user_id', subscription.user_id)
    .eq('enabled', true);
  if (error) throw error;

  let sent = 0;
  for (const token of (tokens ?? []) as PushTokenRow[]) {
    const inserted = await insertNotificationLog(subscription, latestVolume, token.expo_push_token);
    if (!inserted) continue;

    const title = `${subscription.series_title} ${latestVolume}巻が見つかりました`;
    const response = await sendExpoPush({
      body: '本棚で新刊情報を確認できます。',
      data: {
        seriesKey: subscription.series_key,
        url: `/series/${encodeURIComponent(subscription.series_title)}`,
      },
      sound: 'default',
      title,
      to: token.expo_push_token,
    });

    await supabase
      .from('notification_logs')
      .update({
        notification_title: title,
        response,
        status: response.ok ? 'sent' : 'error',
      })
      .eq('user_id', subscription.user_id)
      .eq('series_key', subscription.series_key)
      .eq('volume_number', latestVolume);

    if (response.ok) sent += 1;
  }

  return sent;
}

async function insertNotificationLog(
  subscription: SubscriptionRow,
  latestVolume: number,
  expoPushToken: string,
) {
  const { error } = await supabase.from('notification_logs').insert({
    expo_push_token: expoPushToken,
    series_key: subscription.series_key,
    series_title: subscription.series_title,
    status: 'pending',
    user_id: subscription.user_id,
    volume_number: latestVolume,
  });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

async function sendExpoPush(message: Record<string, unknown>) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(message),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  return {
    body: await response.json().catch(() => null),
    ok: response.ok,
    status: response.status,
  };
}
