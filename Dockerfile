FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

# 依存だけ先にインストールしてレイヤキャッシュを効かせる。
# ffmpeg-static / ffprobe-static / sharp は prebuilt バイナリ同梱のため
# 追加の apt パッケージは不要。
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

# アプリ本体
COPY src ./src
COPY public ./public

# 作業ディレクトリ（compose では tmpfs をマウントする）
RUN mkdir -p uploads outputs \
  && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/config').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
