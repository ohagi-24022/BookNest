import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'booknest.wishlist.v1';

export type WishlistItem = {
  id: string;
  title: string;
  score: number;
  note?: string;
  purchaseUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type WishlistInput = {
  title: string;
  score: number;
  note?: string;
  purchaseUrl?: string;
};

type WishlistContextValue = {
  items: WishlistItem[];
  addItem: (input: WishlistInput) => void;
  deleteItem: (id: string) => void;
  updateItem: (id: string, input: Partial<WishlistInput>) => void;
};

const WishlistContext = createContext<WishlistContextValue | null>(null);

function createId() {
  return `wish-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function clampScore(score: number) {
  if (!Number.isFinite(score)) return 50;
  return Math.min(Math.max(Math.round(score), 1), 100);
}

function normalizeWantedTitle(title: string) {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[「」『』【】［］\[\]（）()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function WishlistProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedItems) => {
        if (!storedItems) return;
        const parsedItems = JSON.parse(storedItems) as WishlistItem[];
        if (Array.isArray(parsedItems)) setItems(parsedItems);
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [hydrated, items]);

  useEffect(() => {
    if (!hydrated || !supabase || !user) return;
    const client = supabase;
    const syncWishlist = async () => {
      const rows = items
        .map((item) => ({
          note: item.note ?? null,
          normalized_title: normalizeWantedTitle(item.title),
          purchase_url: item.purchaseUrl ?? null,
          score: item.score,
          title: item.title,
          updated_at: item.updatedAt,
          user_id: user.id,
        }))
        .filter((row) => row.normalized_title);

      if (rows.length > 0) {
        await client.from('wanted_manga').upsert(rows, { onConflict: 'user_id,normalized_title' });
      }

      const currentKeys = new Set(rows.map((row) => row.normalized_title));
      const { data: storedRows } = await client
        .from('wanted_manga')
        .select('normalized_title')
        .eq('user_id', user.id);
      const staleKeys =
        storedRows
          ?.map((row) => row.normalized_title)
          .filter((key): key is string => typeof key === 'string' && !currentKeys.has(key)) ?? [];
      if (staleKeys.length > 0) {
        await client.from('wanted_manga').delete().eq('user_id', user.id).in('normalized_title', staleKeys);
      }
    };

    void syncWishlist();
  }, [hydrated, items, user]);

  const value = useMemo(
    () => ({
      items: [...items].sort((left, right) => right.score - left.score || right.updatedAt.localeCompare(left.updatedAt)),
      addItem: (input: WishlistInput) => {
        const title = input.title.trim();
        if (!title) return;
        const now = new Date().toISOString();
        setItems((current) => [
          {
            id: createId(),
            title,
            score: clampScore(input.score),
            note: input.note?.trim() || undefined,
            purchaseUrl: input.purchaseUrl?.trim() || undefined,
            createdAt: now,
            updatedAt: now,
          },
          ...current,
        ]);
      },
      deleteItem: (id: string) => {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      updateItem: (id: string, input: Partial<WishlistInput>) => {
        setItems((current) =>
          current.map((item) =>
            item.id === id
              ? {
                  ...item,
                  ...(input.title !== undefined ? { title: input.title.trim() || item.title } : {}),
                  ...(input.score !== undefined ? { score: clampScore(input.score) } : {}),
                  ...(input.note !== undefined ? { note: input.note.trim() || undefined } : {}),
                  ...(input.purchaseUrl !== undefined
                    ? { purchaseUrl: input.purchaseUrl.trim() || undefined }
                    : {}),
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        );
      },
    }),
    [items],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) {
    throw new Error('useWishlist must be used inside WishlistProvider');
  }
  return context;
}
