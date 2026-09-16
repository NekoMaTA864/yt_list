# yt_list

Gemini API 與 YouTube 公開影片音樂分類測試站，預計部署到 GitHub Pages。

## 目前功能

- 暫時輸入 Gemini API Key
- 呼叫 Gemini API 驗證 Key 是否可用
- 傳入公開 YouTube URL，要求 Gemini 分析音樂曲風
- 顯示主曲風、次曲風、影片類型、語言、氛圍與信心度
- 不會寫入 YouTube 播放清單

## 安全限制

這是純前端 GitHub Pages 原型。API Key 會由瀏覽器直接送往 Google Gemini API，因此不能視為正式安全的後端服務。

- 不使用 `localStorage`、Cookie 或遠端資料庫保存 API Key
- 不將 API Key 寫入 Git 或網站程式碼
- 頁面離開時清除輸入欄位
- 請勿使用綁定付費帳單或其他重要服務的 API Key
- 免費 Gemini API 的內容使用與額度限制，請以 Google 官方文件為準

## 本機預覽

在此資料夾執行：

    python -m http.server 8000

再開啟 `http://localhost:8000`。

直接用 `file://` 開啟可能會受到瀏覽器 CORS 限制，因此建議使用本機 HTTP server。

## 後續規劃

1. 驗證免費 Gemini API Key
2. 測試單首公開 YouTube 影片
3. 加入批次分類與 `video_id` 快取
4. 產生 dry-run 分類預覽
5. 再評估串接 YouTube Data API 或瀏覽器自動化修改播放清單
