# BookNest

BookNest is a mobile app for managing owned books, unread books, and completed books by series.
It is designed for readers who buy manga, light novels, and other multi-volume series and want to quickly see owned volumes, missing volumes, and reading status.

## Features

- ISBN barcode scanning with Expo Camera
- Book metadata lookup via OpenBD, Google Books, and optional Rakuten Books API
- Manual book registration and ISBN lookup fallback
- Series-based bookshelf view
- Missing volume detection for gaps such as volume 5 and 7 without volume 6
- Reading status management: unread, reading, read
- Bulk status updates in series detail
- Supabase Auth and PostgreSQL synchronization
- Light, dark, and system theme modes
- External purchase link handling for missing volumes

## Tech Stack

- React Native
- Expo SDK 54
- expo-router
- Supabase
- EAS Build
- OpenBD API
- Google Books API
- Rakuten Books API, optional

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Fill in the required values:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY=
EXPO_PUBLIC_RAKUTEN_APP_ID=
EXPO_PUBLIC_RAKUTEN_ACCESS_KEY=
```

Start with Expo Go:

```bash
npm run start:go
```

If cache-related issues occur:

```bash
npm run start:go -- --clear
```

## Environment Variables

| Name | Required | Description |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon public key |
| `EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY` | Recommended | Google Books API key |
| `EXPO_PUBLIC_RAKUTEN_APP_ID` | Optional | Rakuten Web Service application ID for better Japanese book metadata and cover images |
| `EXPO_PUBLIC_RAKUTEN_ACCESS_KEY` | Optional | Rakuten Web Service access key. Required together with the Rakuten application ID |

Do not commit `.env`. Use `.env.example` as the shareable template.

For production-like Rakuten API access, deploy the Supabase Edge Function and store the Rakuten values as Supabase secrets:

```bash
npx supabase secrets set RAKUTEN_APP_ID=your-rakuten-application-id
npx supabase secrets set RAKUTEN_ACCESS_KEY=your-rakuten-access-key
npx supabase secrets set RAKUTEN_REFERER=https://github.com/ohagi-24022/BookNest
npm run supabase:deploy:rakuten
```

## Supabase

Database migrations are stored in `supabase/migrations`.

Important tables and policies include:

- `books`
- Row Level Security for authenticated users
- User-scoped insert, update, delete, and select policies
- Optional unique index for preventing duplicate ISBN registration per user

## EAS

Configure EAS:

```bash
npm run eas:configure
```

Development build:

```bash
npm run eas:build:dev
```

Android preview build:

```bash
npm run eas:build:preview:android
```

Production build:

```bash
npm run eas:build:production
```

## Project Status

BookNest is under active development. Current focus areas are:

- More reliable series grouping
- Better cover image retrieval for Japanese books
- Missing volume workflow improvements
- Scan confirmation and continuous registration modes
- Reading notes and reading history features

New release push notifications are planned, but currently deferred until the data model and notification workflow are finalized.
