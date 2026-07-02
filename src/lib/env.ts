import Constants from 'expo-constants';

type ExtraConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleBooksApiKey?: string;
  rakutenAppId?: string;
  rakutenAccessKey?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;

function clean(value?: string) {
  return value?.trim().replace(/^['"]|['"]$/g, '') || undefined;
}

function cleanSupabaseUrl(value?: string) {
  const cleaned = clean(value);
  if (!cleaned) return undefined;

  return cleaned.replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/, '');
}

export const env = {
  supabaseUrl:
    cleanSupabaseUrl(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? cleanSupabaseUrl(extra.supabaseUrl),
  supabaseAnonKey:
    clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ?? clean(extra.supabaseAnonKey),
  googleBooksApiKey:
    clean(process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY) ?? clean(extra.googleBooksApiKey),
  rakutenAppId:
    clean(process.env.EXPO_PUBLIC_RAKUTEN_APP_ID) ?? clean(extra.rakutenAppId),
  rakutenAccessKey:
    clean(process.env.EXPO_PUBLIC_RAKUTEN_ACCESS_KEY) ?? clean(extra.rakutenAccessKey),
};

export const envStatus = {
  hasSupabaseUrl: !!env.supabaseUrl,
  hasSupabaseAnonKey: !!env.supabaseAnonKey,
  hasGoogleBooksApiKey: !!env.googleBooksApiKey,
  hasRakutenAppId: !!env.rakutenAppId,
  hasRakutenAccessKey: !!env.rakutenAccessKey,
};
