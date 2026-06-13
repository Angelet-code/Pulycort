FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY . .
RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["npm", "run", "start:prod"]
