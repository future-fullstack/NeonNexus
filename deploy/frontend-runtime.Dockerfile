# Package a checked, frozen Astro Node build without uploading private data or source drafts.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node dist ./dist
USER node
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=6s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4321/neonnexus/about/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","dist/server/entry.mjs"]
