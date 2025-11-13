Apex Shooter — Apple 風格靜態射擊遊戲

說明
- 這是一個單檔靜態網頁，使用 HTML / CSS / JS（Canvas）實作簡單的射擊遊戲。
- 風格上參考 Apple 的極簡 UI：系統字型、圓角、淡背景、玻璃化效果。

如何執行
1. 在檔案總管中打開 `index.html`（或在終端執行 `open index.html`）。
2. 使用鍵盤操作：左右方向鍵 / A D 移動，空白鍵射擊。也可在行動裝置上點擊畫面兩側或使用下方按鈕。

新增功能
- 高分（highscore）儲存於 localStorage（key: `apex_highscore_v1`）。
- 使用 WebAudio API 產生簡單射擊與爆炸音效（無需外部檔案）。
- 行動裝置專用按鈕（左右 / 射擊），並提供 tap-to-move 支援。
 - 支援深色/淺色主題切換：按鈕以太陽/月亮圖示顯示，預設會跟隨系統偏好（prefers-color-scheme），若使用者切換則會儲存在 localStorage（key: `apex_theme_v1`）。

可改進的地方（建議）
- 將音效換成更豐富的樣本檔（放在 /assets）
- 增加暫停時的視覺化 overlay
- 加入關卡與 UI 動畫

授權
- 此專案為示範用，可自由修改與使用。