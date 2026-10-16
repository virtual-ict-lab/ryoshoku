# 日本語OCRモデルの比較

提供された2026年のPDF 7件から、通常文字・アウトライン文字・長い料理名・赤字・A/B見出し・イラスト・実際の空欄を含む15セルを選び、画像を目視して正解を書いた。PDFのファイル名と本文期間が異なるものがあるため、日付の正解には本文を使う。

240 dpi、同一セル画像での最初の比較。Unicode NFKCと空白を除いた文字列を比べ、料理名の補正は行わない。15セルは小規模な選定用データであり、全献立の正確性を保証する数値ではない。

| モデル・処理 | 完全一致セル | 文字誤り率 |
| --- | ---: | ---: |
| NDLOCR-Lite（公式検出・読み順・認識カスケード） | 9/15 | 7.77% |
| PP-OCRv5 server（RapidOCR） | 6/15 | 3.79% |
| PP-OCRv6 small（RapidOCR） | 13/15 | 0.57% |
| **PP-OCRv6 medium（採用）** | **14/15** | **0.38%** |

誤りは案内文「夜カレー登場！！」の「カ」「ー」。この比較では料理名の意味補正を実施していない。目視参照の魚名は450 dpiの再確認により「鯖」とした。NDLOCR-Liteはcommit `d001dad2013ceabb5736ff8d637474e443eb73c2`、RapidOCRは3.10.0、ONNX Runtimeは1.23.2。

初期比較はRapidOCR既定の認識スコア閾値0.5。実装は生の低信頼度候補も保存するため閾値0.0にし、0.85未満を要確認として記録する。最新実装での再測定は `bun run benchmark --run --images-dir /path/to/cell-images` で実施でき、`data/benchmark/report.json` の `production-medium-raw` に記録される。画像入力はパレットPNGをそのまま渡さずRGBへ変換する。

[測定結果](ocr-evaluation.json)と正解の文字列は保持しています。原PDF・切り抜き画像・画像入りHTMLは同梱しません。実OCRを再評価する場合は、手元のセル画像を `--images-dir` で指定してください。画像の番号と出典は `tests/fixtures/ocr/truth.json` に記録しており、測定時にOCR結果から正解を書き換えません。

## 全PDFの検証

```sh
uv run pytest -q
uv run python scripts/evaluate_archive.py /path/to/pdfs
bun run scripts/verify_archive.ts data/evaluation /path/to/pdfs
```

通常のユニットテストは自作のPDFをメモリ上で生成し、外部資料なしで実行します。実際の献立を検証する場合は手元のPDFを指定します。罫線に従って7日表と5日表を分割する。PDF本文の期間が列数と一致すること、全ての列に朝昼夕が一つずつあることをBun側で検証する。文字が取れないセルは未提供と断定せず「読み取り結果なし」と表示する。全ての献立セルが空なら更新を失敗させる。

## 参照

- [PP-OCRv6公式モデル](https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec)
- [RapidOCR](https://github.com/RapidAI/RapidOCR)
- [NDLOCR-Lite](https://github.com/ndl-lab/ndlocr-lite)
- [提供されたPDFアーカイブ](https://github.com/virtual-ict-lab/knct-ryoshoku-cache/tree/main/archive/2026)

生OCRの再測定は13/15セル、CER 0.76%。空欄のイラストから信頼度0.266で「RM」が認識された。実装ではこれも生データに保存し、信頼度0.5未満はEmbedに載せず、警告を残す。表示用テキストは14/15セル、CER 0.38%となる。
