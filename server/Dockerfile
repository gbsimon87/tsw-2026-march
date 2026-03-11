FROM node:20-alpine

WORKDIR /app

RUN corepack enable

COPY package.json ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

EXPOSE 4000
CMD ["pnpm", "start"]
