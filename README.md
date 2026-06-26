# nauto9

ローカルで動く Electron デスクトップアプリ。NovelAI（v4.5）でキャラクター × シチュエーションの
画像を一括生成し、ギャラリーとして管理、さらに LLM（xAI Grok）でセリフを付け、
WordPress へ下書き投稿するところまでを 1 つのアプリで行います。

データ（DB・画像・トークン）はすべて**ローカルにのみ**保存され、外部に送信されるのは
あなたが明示的に実行したとき（NovelAI 生成・LLM へのセリフ生成・WordPress 投稿）だけです。

> 個人利用の制作ツールです。生成・投稿物が利用先サービスの規約と各国法令の範囲内であることは
> 利用者の責任です。

---

## 主な機能

- **キャラクター管理** — 名前 / プロンプト / ネガティブ / 置換ルール / メモ / 性格（セリフ用）/ タグ /
  参照画像（Vibe Transfer・精密参照）。
- **シチュエーション** — ストーリー単位で状況プロンプトを管理。`xxx` は生成時にキャラ名へ置換。
- **一括生成** — 「1 キャラ × ストーリー全シチュ」または「選択シチュ × タグの付いた全キャラ」を一括生成。
- **ギャラリー** — バッチごとに結果を一覧。再生成・ダウンロード（ZIP）・画像編集。
- **画像編集** — 手描きモザイク、**局部の自動検出モザイク**（ONNX）、まとまり単位の**一括自動モザイク**、
  **インペイント（再描画）**、編集前への**ワンクリック復元**。
- **セリフ生成** — 画像ごとに、その状況でキャラが言いそうなセリフを xAI Grok で生成・編集。
- **記事生成 / WordPress 投稿** — 章立て・本文・各画像とセリフを組み立て、下書きとして投稿。
- **バックアップ** — DB と画像ライブラリ全体を 1 つの .zip にエクスポート / インポート（設定画面）。

---

## 動作環境・必要なもの

| 必要 | 内容 |
|------|------|
| **macOS** | 配布ビルドは Apple Silicon（arm64）。開発も macOS 前提（バックアップ機能は `ditto` を使用）。 |
| **Node.js 20+**（推奨 22） | 開発・ビルドに必要。`node -v` で確認。 |
| **Xcode Command Line Tools** | `better-sqlite3` / `onnxruntime-node` のネイティブモジュール用。`xcode-select --install`。 |
| **NovelAI アカウント** | 画像生成に必須。API トークン（`pst-...`）を設定画面に登録。 |

### 任意（使う機能に応じて）

- **xAI Grok API キー** — セリフ・記事文の生成に使用します（テキスト生成のバックエンド）。
  設定画面で API キーとモデル名（既定 `grok-4.3`）を登録。露骨な表現はサービス規約上
  拒否されることがあります。
- **WordPress サイト + アプリケーションパスワード** — 記事を下書き投稿する場合。

> テキスト生成は現状すべて **xAI Grok（クラウド）** を使います。ローカル LLM（Ollama）は
> **現在使用していません**（コードにも組み込まれていません）。リポジトリに残る
> `models/Ninja-v1-NSFW-RP.Modelfile` は、将来ローカル運用へ戻す場合に備えた未使用の名残です。

---

## セットアップ

```sh
git clone git@github.com:manatago/nauto9.git
cd nauto9
npm install        # postinstall でネイティブモジュールを Electron 向けに再ビルド
```

> ネイティブモジュール（better-sqlite3 / onnxruntime-node）は `npm install` の `postinstall`
> （`electron-builder install-app-deps`）で自動的に Electron 用へリビルドされます。
> エラーが出る場合は Xcode CLT が入っているか確認してください。

### 開発モードで起動

```sh
npm run dev
```

開発時はデータが**プロジェクト直下の `.dev-data/`** に保存されます（DB と画像）。
このフォルダは `.gitignore` 済みで、Git には載りません。

### 配布ビルド（.dmg / .zip）

```sh
npm run dist        # electron-vite build → electron-builder --mac（dmg + zip）
# 出力は dist/ に生成されます
```

配布版ではデータは macOS の `~/Library/Application Support/nauto9/data/` に保存されます。

### アプリアイコン

アプリアイコンは `build/icon.icns`（と `build/icon.png`）です。差し替えるときは 1024×1024 の
PNG を用意し、次で再生成します（`build/` 配下のアイコンは Git にコミットされます）。

```sh
ICONSET=/tmp/nauto9.iconset; rm -rf "$ICONSET"; mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s icon.png --out "$ICONSET/icon_${s}x${s}.png"
  sips -z $((s*2)) $((s*2)) icon.png --out "$ICONSET/icon_${s}x${s}@2x.png"
done
iconutil -c icns "$ICONSET" -o build/icon.icns
cp icon.png build/icon.png && cp icon.png resources/icon.png   # resources/ は開発時の Dock 用
```

---

## 初回設定（設定画面）

アプリ右上「設定」から登録します（すべてローカル DB に保存）。

1. **NovelAI トークン**（必須） — `pst-...`。保存後「疎通確認」で残り Anlas を表示。
2. **参照画像の生成への反映** — Vibe Transfer / 精密参照のモードと強度。
3. **キャラ試し撃ち（プレビュー）** — プレビュー生成時に足す共通プロンプト（品質タグ等）。
4. **Grok 設定**（任意） — xAI の API キーとモデル名。
5. **WordPress 投稿**（任意） — サイト URL / ユーザー名 / アプリケーションパスワード。
6. **広告リンク**（任意） — 記事の 2 番目以降の見出し直前にランダム挿入する HTML。
7. **データのバックアップ / 移行** — エクスポート / インポート（下記）。

セリフ用プロンプトテンプレートなどのテキスト生成まわりの調整も設定画面で行います。

---

## 使い方の流れ

1. **キャラクター**を作成（プロンプト・参照画像・性格などを登録）。
2. **シチュエーション**をストーリー単位で用意（`xxx` がキャラ名に置換される）。
3. **一括生成**でバッチを作成 → NovelAI が画像を生成。
4. **ギャラリー**で結果を確認。必要に応じて：
   - **自動検出モザイク** / **一括モザイク**（局部＝puss/ penis を検出して FINE モザイク）、
     手描きモザイク、**インペイント**で部分再描画。
   - 不要なモザイク・再描画は「**モザイク前に戻す**」で編集前へ復元。
   - 各画像に **セリフ**を生成・編集（xAI Grok）。
5. **記事**を組み立てて WordPress に下書き投稿。

### 局部自動検出モデルについて

自動モザイクは `resources/models/censor_detect_v1.0_s.onnx`
（[deepghs/anime_censor_detection](https://huggingface.co/deepghs/anime_censor_detection), YOLOv8-s）を
`onnxruntime-node` でローカル実行します。検出は**提案**であり完璧ではないため、見逃しは手描きで補い、
過検出は「モザイク前に戻す」で取り消せます（胸/乳首は対象外、pussy / penis のみ）。

---

## データの保存場所とバックアップ

| | 開発（`npm run dev`） | 配布版 |
|--|--|--|
| 保存先 | `./.dev-data/` | `~/Library/Application Support/nauto9/data/` |
| 中身 | `nauto9.db` + `storage/`（画像） | 同左 |

`NAUTO9_DATA_DIR` 環境変数を指定すると保存先を上書きできます（テスト用途など）。

### エクスポート / インポート

設定 →「データのバックアップ / 移行」から：

- **エクスポート** — DB + 画像ライブラリ全体を 1 つの `.zip` に書き出し（保存先はダイアログで選択）。
  別 PC への移行や定期バックアップに使えます。
- **インポート** — `.zip` を選ぶと現在のデータを置き換えます。**現在のデータは削除せず別フォルダへ退避**
  （`<データ dir>.pre-import-<日時>`）し、完了後アプリが再起動（開発時は終了→手動で `npm run dev`）。

> 数 GB 規模の画像も扱えるよう、zip 化は macOS の `ditto` でストリーム処理しています。

---

## Git で管理されるもの / されないもの

- **コミットされる**: ソース、アプリアイコン（`build/`・`resources/icon.png`）、
  局部検出モデル（`resources/models/*.onnx`）。
- **コミットされない**（`.gitignore`）: あなたの画像・データベース（`.dev-data*`）、
  ビルド成果物（`out/` `dist/`）、`node_modules/`、`.env*`、バックアップの一時フォルダ等。

つまり**ユーザーが生成した画像や DB はリポジトリには一切載りません**。
移行・共有はバックアップのエクスポート/インポート機能を使ってください。

---

## 開発・品質ゲート

```sh
npm run lint        # ESLint
npm run typecheck   # tsc（main / web）
npm test            # vitest（純粋ロジックのみ）
npm run build       # electron-vite build
```

- 構成: `src/main`（メインプロセス）/ `src/preload`（contextBridge）/ `src/renderer`（React + Vite + Tailwind + SWR）/
  `src/shared`（共有型）。
- DB は better-sqlite3。スキーマは加算マイグレーション（`src/main/db/schema.ts`）。
- テストは**実データ（`.dev-data`）に触れません**。`NAUTO9_DATA_DIR` を使った隔離データで実行します。

---

## ライセンス

MIT
