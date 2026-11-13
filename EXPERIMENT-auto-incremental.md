# 実験レポート: `streaming` prop なしで Comark の増分パースを自動化できるか

- ブランチ: `experiment/auto-incremental-streaming`
- 対象: comark-solid 0.2.0-next.3 / comark 0.9.1（リポジトリのピン）/ solid-js 2.0.0-rc.21
- 結論: **成立する。** 公開 API は変更していない（実験コードは `src/experimental/` と
  `tests/experimental/` のみ、`src/index.ts` からは export していない）。

## 先行実装の確認

### Comark コア（`packages/comark/src/core.ts`, 0.9 系）

増分パースは既にコア側に実装されている。レンダラー側の仕事は「パーサー
インスタンスを使い回し、`{ streaming: true }` を渡し続けること」だけ。

- `createSerializedMarkdownParser` は呼び出しを直列化する
  （`createSerializedTask`: 前の呼び出しが settle するまで次を始めない。
  失敗は握り潰さず呼び出し元へ返し、キューは動き続ける）。
- `streaming: true` のときだけ、前回の `lastInput` / `lastOutput` を保持する。
  再利用条件はコア自身が再検証する:
  - `markdown.startsWith(lastInput)` でない → 全体をパース
  - `]:`（参照定義）を含む → 全体をパース
  - 末尾に heading / setext 見出しが含まれる → 再利用を棄却して全体をパース
  - 再利用時は `extractReusableNodes` が最後から2番目の完成ノードまでを
    そのまま使い、開いている末尾ブロックだけを再パースする
- `streaming: true` の副作用: auto-close が末尾の未完 opener を落とす
  （`dropTrailingOpeners`）、frontmatter の扱いが変わる、ノードに
  `$: { line }` の位置情報が付く、tokenize エラー時は例外でなく前回結果を返す。
- `streaming: false` の呼び出しは `lastInput` / `lastOutput` をリセットする
  （= 編集後の再同期として使える）。

### React レンダラー PR #397（`perf(react): reuse the parser during streaming`）

- `useMemo` で `options` / `plugins` / `unwrap` が変わらない間パーサーを保持し、
  `createSerializedMarkdownParser` 経由で `streaming` フラグをそのまま渡す。
- `useDeferredValue` で新しいパースが終わるまで前回の結果を表示し続ける。
- 指標は「パーサーに渡した文字数」: 400 回の更新で 3,609,000 → 36,353 文字（約99%減）。
  PR 自身が明記する通り、これはパース量の指標でレンダリング速度ではない。
- Vue / Svelte レンダラーも同型（パーサー保持＋直列化＋`streaming` 伝播）。
  Svelte の `incremental-streaming.svelte.test.ts` が仕様の参考になる
  （末尾だけ再パース、終了時に全体を再パース、設定変更で旧結果を棄却、
  直列化と最新結果の適用、エラーは boundary へ）。

## 実験設計

公開 API を触らず、文字列のみを受け取る実験実装を2形態で作った。

- `src/experimental/auto-incremental.ts` — フレームワーク非依存の分類・制御層
  `createAutoIncrementalParser(options)`:
  - `initial`（初回）: `streaming: false`。静的文書の意味論を現行と完全一致させる。
  - `append`（`next.startsWith(prev)` かつ長い）: `streaming: true`。
  - `edit`（途中編集・縮小・置換）: `streaming: false`（全体パース＋コアのキャッシュリセット）。
  - `same`（同値）: パーサーを呼ばず in-flight / 前回結果を返す（dedupe）。
  - `finalize(value)`: 現在値が streaming で終わっていたら `streaming: false` で
    1回だけ再パース。古い値への finalize は baseline を巻き戻さないよう no-op。
  - `setOptions(next)`: 参照が変わったらパーサー再生成（全状態リセット）。
  - parse が reject したら baseline を進めない（同じ値のリトライが実際に再実行される）。
- `src/experimental/MarkdownAutoMemo.tsx` — `createDeferred`（非同期メモ）形態。
- `src/experimental/MarkdownAuto.tsx` — signal + 2引数 `createEffect` 形態
  （Svelte 版の `$state`/`$effect` の写し）。当初は `finalizeDelayMs` prop で
  idle finalize を実装したが、下記の決定を受けて prop ごと削除済み
  （2026-11-13）。factory の `finalize()` 自体は明示的に呼ぶ低レベル
  ユーティリティとしてテストと共に残置。

## 質問別の検証結果

### 1. 追記と途中編集を判定し、増分／完全パースを切り替えられるか — ✅

- 判定は `startsWith` だけで足りる。過剰に「追記」と判定しても、コアが
  `startsWith(lastInput)`・`]:`・見出しの3条件を再検証して全体パースに倒すため
  誤判定が誤結果にならない（途中編集を `streaming: true` で渡す実験でも全て全体
  パースと一致）。逆に「編集」と判定した場合は `streaming: false` がコアの
  キャッシュをリセットするので、古い再利用ノードが混ざることもない。
- 正しさはコーパスで検証: 追記（見出し・frontmatter・表・参照定義の遅着・
  重複見出し id）、途中編集、縮小、置換、編集後の再追記 — 全ステップで
  ワンショット `parseMarkdown` と一致（`$` を除去して比較）。
- **コスト（prop を消す代償）**: 初回を `streaming: false` で読むため、その時点では
  コアのキャッシュが空で、**1回目の追記も全体パースになる（priming）**。
  再利用が効くのは2回目の追記から。LLM ストリームの典型形（空文字マウント→
  小さなチャンク列）では priming は最小のチャンクで済む。大きな初期値を
  マウント直後に追記するケースだけ、全体パースを1回余分に払う。

### 2. `streaming` prop を公開せずに成立するか — ✅（終了処理を除き。次項）

- 追記／編集の切り替えに prop は不要だった。caret は別問題:
  現行の Solid 版 `MarkdownDocument` には caret 機能自体がないので、
  ストリーミング中の caret 表示が欲しい場合は prop でなく `MarkdownDocument`
  側の機能追加として扱うべき。

### 3. ストリーム終了をどう扱うべきか — ⚠️ 信号がない。割り切りが要る

- prop がない以上「終了」は観測できない。検証した範囲で、pure auto
  （終了処理なし）の結果が全体パースと**乖離するのは末尾の未完 opener だけ**
  （`Hello **`, `Hello *`, `` Hello ` `` → streaming は opener を落とす）。
  未完のリンク・フェンス・コンポーネント・数式、frontmatter、表、setext は
  一致した。理由: ワンショット `parseMarkdown` も `autoClose: true` が既定で、
  両者の差は `dropTrailingOpeners` と frontmatter くらいしかないため。
- 対処案:
  - **A. idle finalize**（実験実装済み）: 値が `finalizeDelayMs` 安定したら
    `streaming: false` で1回再パース。乖離は解消するが、遅延値は原理的に
    決められない（短いと無駄な全体パース、長いと表示が遅れて変わる）。
    実装上の落とし穴を2件踏んだ: (1) 旧値の解決が遅れて届いたときに
    finalize を予約すると新しいストリームを壊す → 「最新値のときだけ予約・
    発火時にも再確認」が必要。(2) factory 側も古い値への finalize を
    no-op にしないと baseline が巻き戻る。
  - **B. 何もしない**: 乖離は「末尾に未完 opener を置いたまま終わる文書」だけ。
    次の編集・マウントし直し・値の置換のいずれでも全体パースに戻る。
    チャット UI では通常ストリーム終了後に再編集が入る。
  - **C. 将来の逃げ道として optional な `streaming` prop** を足す余地は残す
    （今回の結論は「必須ではない」であり「永遠に不要」ではない）。
- 推奨は **B を既定**にし、正確な最終意味論が必要な利用側だけが次の操作で
  全体パースを得る、という割り切り。A は「静的文書として保存・確定する」
  用途が見えたら override signal とのハイブリッドで入れる（下記推奨設計）。
- **決定（2026-11-13、ユーザー判断）: 終了判定は入れない（B で確定）。**
  理由: Solid のコンポーネントにとって `value` は「いつでも変わりうる
  リアクティブな文字列」でしかなく、「ストリームが終わった」という状態は
  そもそもコンポーネントの契約に存在しない。「終わり」はデータを流す側の
  概念であって、描画側がタイマーで推測するものではない。末尾 opener の
  乖離も、値が静止している間だけの話で、次の変更・アンマウント・値の置換の
  いずれでも全体パースに戻る。A の idle finalize は「やればできるが、
  やらない」という evidence として factory の `finalize()` とその単体
  テストのみ残し、コンポーネントの `finalizeDelayMs` prop とタイマー
  実装は削除した（2026-11-13、PR #2 のレビュー反映）。

### 4. 非同期 `createMemo` と `createSerializedMarkdownParser` の組み合わせ — `createDeferred` が適合

2形態を同じテストスイートで比較した結果、**土台は非同期メモ系が必須**:

| 観点                          | `createDeferred` 形態                           | signal + `createEffect` 形態             |
| :---------------------------- | :---------------------------------------------- | :--------------------------------------- |
| SSR（`renderToStream` await） | ✅ 全体 HTML が出る（現行 `<Markdown>` と同じ） | ❌ 空文字（effect はサーバーで動かない） |
| `renderToString`              | fallback シェル＋hydration（現行と同じ）        | ❌ 空文字                                |
| パースエラー→`<Errored>`      | ✅ 表示され、options 変更で回復（heal）         | ❌ **回復不能**（後述）                  |
| パース中の前回結果表示        | ✅ deferred が保持                              | ✅ signal が保持                         |
| idle finalize                 | 置き場がない（compute に副作用は置けない）      | ✅ タイマーを置ける                      |
| 完了した中間結果の表示        | ✅（deferred の意味論通り）                     | ✅（ただし下記の guard 設計が必要）      |

- effect 形態の回復不能について（Solid 2.0.0-rc.21 で実測）: レンダー結果が
  読むメモが throw すると、その branch の computation（component body の
  effect を含む）が dispose される。エラー状態を effect が書く signal 経由で
  throw させると、props が変わっても parse が二度と走らず boundary が
  heal しない。非同期メモのエラーは heal した（props 駆動で再計算されるため）。
  → **エラー状態は「props から再計算される非同期メモ」の中に置く**のが
  Solid 2.0 での整合条件。
- parse 呼び出しを memo compute の中に入れる場合は **同値 dedupe が必須**:
  compute は投機的に再実行されうるので、factory 側で同値を in-flight /
  前回結果に畳む（実装済み・テスト済み）。これがないと無駄な parse と
  直列キューの浪費が起きる。
- 中間結果の適用 guard は「値の世代」ではなく「パーサーの世代」で切る:
  値世代で切ると、直列化で順序保証された中間結果（次の parse が終わる前に
  表示すべきもの）まで捨ててしまう（実測で失敗）。捨てるべきは options
  変更前の旧パーサーの結果だけ。
- 同期的に複数回値が変わると Solid のバッチで中間値は parse されない
  （1 flush = 最新値だけ）。React/Svelte の per-render / per-effect と違う
  Solid らしい利点で、テストで確認済み。

### 5. 連続更新・非同期プラグイン・エラー時の整合性 — ✅（コア側の注意点1件）

- 直列化: 非同期 `pre` プラグインで同時実行数は最大1、各呼び出しが自分の
  値の文書で resolve、最終表示は最新値（Vue/Svelte の同等テストを移植して確認）。
- `pre` が throw: その parse は reject、baseline は進まず、同じ値のリトライも
  実際に再実行され、回復後の追記も全体パースと一致。
- `post` が throw: その parse は reject するが、**コアは `post` の前に
  `lastOutput` を進める**ため、次回の追記は「post が途中まで適用された木」を
  前提に再利用しうる。meta 等が壊れうるので、エラー後は次の編集（全体パース）
  で再同期される前提に立つか、factory 側で「post エラー時は次回を全体パースに
  強制」するガードを足すのが安全（推奨設計に記載）。
- tokenize エラー: `streaming: true` ではコアが前回結果を返す（表示が消えない）。
  `streaming: false` では throw する。自動判定では編集＝throw／追記＝前回維持
  という非対称になるが、これはストリーミング用途の意味論として妥当。
- 同時実行中の同値 parse は dedupe され、プラグインは1回しか走らない。

### 6. 既存の `MarkdownDocument` やサーバー側での利用への影響 — 変更不要・実測済み

- `MarkdownDocument` 本体は**無変更で使える**: streaming 結果（`$` 付きノード）
  をそのまま描画でき、`$` が DOM 属性に漏れないことをテストで確認。
  `value` が `MarkdownDocument` のケースは現行 `<Markdown>` が素通しするので
  影響なし（パーサー自体を生成しない）。
- **parser reuse ≠ DOM reuse**: 現行 `MarkdownDocument` は文書が変わるたびに
  全ノードの DOM を作り直すため、パーサーが再利用した AST ノードでも DOM は
  差し替わる（テストで記録）。パース量の削減がそのまま描画コスト削減には
  ならない。効かせるには `MarkdownDocument` 側でトップレベルノードを
  AST ノード同一性で keyed に描く改修が別途必要（PR #397 が「レンダリング
  速度ではない」と断ったのと同じ境界）。
- サーバー: パーサーは **component instance ごとに生成するのが必須**。
  module scope に置くと文書間・SSR リクエスト間で streaming 状態
  （`lastInput`）を共有して壊れる。2つの factory を交互に進めるテストで
  per-instance の安全性を確認済み。SSR の可否は形態依存（上表）で、
  現行の SSR 挙動を保つなら非同期メモ形態一択。
- 依存追加なし: Solid Router / Start mode / TanStack Start には一切触れていない。

## ベンチマーク（PR #397 と同じ「パーサー入力文字数」指標、70文字ずつ追記）

| シナリオ                                       |  全体パース（現行） |              明示 streaming |              **auto（本実験）** |
| :--------------------------------------------- | ------------------: | --------------------------: | ------------------------------: |
| prose 60段落 / 4,128字 / 59更新                | 123,887 字 / 約40ms |   6,421 字（−94.8%）/ 約4ms |   **6,488 字（−94.8%）/ 約3ms** |
| 見出し＋8段落×12 / 6,232字 / 90更新            | 286,547 字 / 約85ms | 47,489 字（−83.4%）/ 約22ms | **47,502 字（−83.4%）/ 約21ms** |
| 見出し密（各節見出し＋短文）/ 1,838字 / 27更新 |  26,405 字 / 約23ms |     26,405 字（−0%）/ 約8ms |    **26,405 字（−0%）/ 約25ms** |

- auto と明示 streaming の差は priming 1回分だけで、実質同等。
- **見出し密な文書ではコアが再利用を棄却するため削減率は0%**になる
  （末尾に `##` が入るたび全体パース）。これはコア側の既知の TODO
  （heading id と参照のため）で、レンダラー側では回避できない。
  ただし入力文字数が全体パースを超えることはなく、悪化は壁時計で
  数ms 程度（instance 再利用分だけ明示 streaming が速い場面がある）。

## メリット / 制約まとめ

メリット:

- 利用側は何も変えなくてよい（prop 追加なし、既存の静的利用は意味論不変）。
- prose / mixed なストリームでパース量 −83〜95%、明示 streaming と同等。
- 編集・置換・縮小は自動で全体パースに戻り、結果は常に全体パースと一致。

制約:

- 再利用は2回目の追記から（priming の全体パース1回）。
- 見出し密な文書では増分が効かない（コア側の制約）。
- 終了の検出は不可能。末尾未完 opener の乖離だけが残る（対処は次項）。
- DOM は全再構築のまま（`MarkdownDocument` 側の別課題）。
- `options` は参照同一性でしか無効化できない。inline リテラルを毎回渡す
  利用側はパーサーが再生成され続け増分が効かない（React 版も同じ制約で、
  「安定した参照で渡す」ことを文書化する必要がある）。

## 推奨設計（公開 API を変更するなら、この形）

1. `<Markdown>` の string 経路を `createDeferred` ベースに置き換える:
   `createMemo` で options 参照ごとに `createAutoIncrementalParser` を作り、
   `createDeferred(() => parser().parse(props.value))` を `MarkdownDocument`
   に渡す。`value: MarkdownDocument` の経路は現行通り素通し。
   → SSR・Errored の heal・前回結果の保持が現行と同等に保てる。
2. 終了処理は入れない（決定済み、上記「決定」参照）。idle finalize は
   不採用。どうしても正確な最終形が必要な利用側は、確定したい時点で
   値を差し替える／再マウントするなど、データ側の操作で全体パースを
   得る（parse 自体を effect に移さないこと）。
3. factory に「エラー後は次回を全体パースに強制」ガードを足してから
   本採用する（`post` throw 時の cache 前進への対策）。
4. caret が欲しくなったら `streaming` prop ではなく `MarkdownDocument`
   の caret 機能として別途設計する。
5. ドキュメントに「`options` は安定した参照で渡す」を明記する。

## 残課題・未検証

- hydration: サーバーで deferred が採用した値をクライアントが引き継ぐ際、
  compute の再実行と factory の dedupe / priming がどう相互作用するかは
  未検証（hydration テスト基盤が現行リポジトリにない）。
- comark 0.9.2（upstream main）への追随: 本検証は 0.9.1 ピンで実施。
  コアの増分ロジックは 0.9.2 でも同系統だが、バージョンを上げる場合は
  本テストスイートの再実行で確認できる形にしてある。
- `MarkdownDocument` の keyed 描画（DOM reuse）は別実験のテーマ。

## 再現方法

```bash
vp install
vp test          # 全97件（うち実験分: factory 24 / component 17 / bench 3 / SSR 2）
vp check         # format / lint / typecheck
```
