# Tech Kirakira Studio

任意の画像を入力し、OpenRouter の `google/gemini-3.1-flash-image-preview` で
kirakira な Instagram 風 flat-lay に再編集する Astro アプリです。PNG / JPEG /
WEBP / GIF に加えて、HEIC / HEIF のアップロードも受け付けます。

## Setup

1. OpenRouter の API キーを用意します。
2. ルートに `.env` を作成して次を設定します。

```bash
OPENROUTER_API_KEY=your_openrouter_api_key
```

3. 依存を入れて起動します。

```bash
bun install
bun dev
```

## Features

- 画像アップロード
- HEIC / HEIF をサーバー側で JPEG に変換して処理
- プロンプト内プレースホルダ用の被写体説明フォーム
- OpenRouter を呼ぶサーバー API ルート `src/pages/api/edit.ts`
- 入力画像プレビューと出力画像プレビュー
- 生成画像のダウンロード

## Commands

- `bun dev` - 開発サーバー
- `bun run build` - 本番ビルド
- `bun run preview` - ビルド結果の確認

## Deploy to Netlify

- Netlify では Astro の Netlify adapter を使って Functions に API ルートを載せます。
- `OPENROUTER_API_KEY` を Netlify の Environment variables に設定してください。
- このリポジトリには `netlify.toml` があるので、Git 連携デプロイ時はそのまま `npm run build` が使われます。
