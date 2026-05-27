FROM node:18-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /usr/src/app

# Cài đặt các thư viện hệ thống cần thiết cho Sharp trên Alpine
RUN apk add --no-cache libc6-compat

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist
# Sao chép các file cấu hình và tài nguyên
COPY --from=builder /usr/src/app/public ./public

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/main"]
