FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public
ARG SITE_URL=https://39.96.71.56
ARG SITE_BASE=/neonnexus/
ENV SITE_URL=$SITE_URL SITE_BASE=$SITE_BASE
RUN npm run check

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=6s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4321/neonnexus/about/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server/entry.mjs"]
