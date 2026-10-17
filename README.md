# Climate Log

SwitchBot温湿度計をGitHub Actionsで定期取得し、GitHub Pagesにグラフを公開します。サーバーの常時稼働やnpmのインストールは不要です。

## できること

- 複数センサーの温度・湿度を約5分ごとに記録
- スマートフォンに対応した24時間・7日・30日・90日のグラフ
- センサーごとの表示切替、最低・平均・最高、CSV出力、値の表表示
- 未接続・取得失敗・20分以上更新がない状態の表示
- 月別JSONによる長期履歴の保存（グラフ表示は直近90日まで）
- サンプル表示は明確に区別され、実際の記録に保存されません

## 初期設定

### 1. SwitchBotを準備

温湿度計をアカウントに登録し、対応するハブをインターネットへ接続してください。機種・アプリのバージョンに応じて「サードパーティーサービス」などの設定を確認します。

SwitchBotアプリ（v9以降）の「プロフィール → 設定 → アプリについて」でアプリのバージョンを10回タップし、「開発者向けオプション → トークンを取得」からTokenとSecretを確認します。表示名はアプリによって異なる場合があります。

### 2. GitHub Secretsを登録

リポジトリの **Settings → Secrets and variables → Actions → New repository secret** で登録します。キーはコードやIssue、チャットへ貼り付けず、Secretsの入力欄に直接登録してください。

| Secret | 内容 | 必須 |
| --- | --- | --- |
| `SWITCHBOT_TOKEN` | SwitchBotのToken | 必須 |
| `SWITCHBOT_SECRET` | SwitchBotのSecret | 必須 |
| `SWITCHBOT_DEVICES` | 取得対象と公開名を指定するJSON | 任意 |

`SWITCHBOT_DEVICES` を省略すると、対応する温湿度計を自動検出し、SwitchBotアプリ上の機器名で公開します。アプリで名前を変更すると次回取得時に表示名も更新され、過去の履歴は引き継ぎます。名前が空の場合のみ「センサー 1」などで表示します。検出できない機種、対象を限定したい場合、公開名を別に指定したい場合は、次のJSONをこのSecretに登録してください。この明示設定の `name` はアプリの名前より優先されます。`id` はSwitchBot APIの機器一覧 `GET /v1.1/devices` で確認する機器IDです。

```json
[
  {"id":"YOUR_DEVICE_ID","alias":"room-a","name":"展示室 A"},
  {"id":"YOUR_OTHER_DEVICE_ID","alias":"room-b","name":"展示室 B"}
]
```

`alias` は小文字英数字とハイフンで、一意かつ固定の名前にしてください。変更すると別センサーとして扱われます。自動検出から明示指定へ切り替える際は、`docs/data/latest.json` にある公開IDを `alias` に使うと履歴を引き継げます。自動検出時はSecretを使ったHMACで公開IDを作るため、Secretの変更でも公開IDが変わります。

**温湿度・取得日時・アプリ上の機器名（または明示設定した公開名）・履歴は、公開サイトとリポジトリから誰でも閲覧・ダウンロードできます。** 個人名や住所などを公開名に入れないでください。機器の実IDと認証情報は公開JSONに含めません。

### 3. GitHub Pagesを設定

**Settings → Pages → Build and deployment → Source → GitHub Actions** を選択します。

次に **Actions → Collect and publish climate → Run workflow → main → Run workflow** を実行します。成功した実行の `github-pages` environment に公開URLが表示されます。Secrets登録前に公開すると「未接続」の画面になります。

公開リポジトリでは標準GitHub-hosted runnerのActionsとPagesを利用できます。プランや利用規約はGitHub公式情報を確認してください。

## 動作

1. GitHub Actionsが5分間隔で起動し、Python標準ライブラリからSwitchBot API v1.1へ署名付きリクエストを送信。
2. 認証情報と機器の実IDを取り除き、`docs/data/latest.json`、`status.json` と月別履歴を更新。
3. データをGitにコミットして保存し、`docs` だけをPagesにデプロイ。
4. ページは1分ごとに公開JSONを再取得。ページを閉じてもActionsは収集を継続。

定期取得は外部処理なので、PCやスマートフォンの常時起動は不要です。GitHub Actionsのスケジュールは遅延・未実行の可能性があり、厳密な5分間隔や監視用途の可用性は保証されません。ページの日時は日本時間、保存データとCSVはUTCです。APIの取得日時を記録しており、機器が実際に測定した時刻を示すものではありません。APIで同じ値が返っても記録します。API取得頻度と機器の測定・クラウド更新頻度は異なります。

取得に失敗したセンサーは以前の値と取得時刻を残し、新しい履歴には追加しません。失敗状態も公開してからActionsを失敗終了するため、Actionsの結果で検知できます。機器一覧の取得や設定検証が失敗した場合も既存の値を保持します。認証情報が未登録の場合、定期処理は収集・公開をスキップし、既存データを上書きしません。

表示中の期間について取得値の算術平均を計算します。時間加重平均ではないため、取得間隔に偏りがあると平均も影響を受けます。20分を超える空白はグラフの線を切ります。

5分間隔なら1台288回/日、自動検出を使うと機器一覧分としてさらに288回/日が必要です。公式のAPI上限は1日10,000回です。他のアプリのAPI利用とリトライも考慮してください。取得頻度は `.github/workflows/climate.yml` のcronで変更できます。

履歴は月別JSONとしてGitに保存し、現時点では自動削除しません。取得ごとにコミット・公開するため、長期利用ではリポジトリが増大します。台数が多い場合や高頻度・長期運用ではデータベースへの移行を検討してください。定期実行が無効化された場合はActionsの画面から再有効化します。

公開ページからSwitchBotへ直接アクセスする処理はありません。ページ内に認証情報の入力欄はありません。

## 開発・検証

```bash
python3 -m unittest discover -s tests -v
node --test tests/chart.test.mjs
python3 -m http.server 8000 --directory docs
```

`http://localhost:8000` で確認できます。外部のJavaScriptライブラリは使いません。フォントはGoogle Fontsから取得し、利用できない場合はシステムフォントで表示します。

実データの接続確認にはToken・Secretとオンラインのハブが必要です。自動テストはAPIの応答を模擬し、認証情報を含めません。

## 公式資料

- [SwitchBot Open API](https://github.com/OpenWonderLabs/SwitchBotAPI)
- [SwitchBot温湿度計のデータ更新頻度](https://support.switch-bot.com/hc/en-us/articles/25328810947351-SwitchBot-Meter-Data-Update-Frequency)
- [GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Actionsのschedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

SwitchBot公開APIの仕様には過去履歴を一括取得する機能が記載されていないため、このサイトでの収集開始後に履歴が蓄積します。商用サービスへの組み込みや大規模利用では、SwitchBot公式の利用条件を確認してください。
