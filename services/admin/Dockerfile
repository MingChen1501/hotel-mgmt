# syntax=docker/dockerfile:1

# Build stage: compiled TypeScript, production dependencies only.
FROM node:22-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . ./
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /src/dist ./dist
EXPOSE 8088
ENV PORT=8088
CMD ["node", "dist/index.js"]
