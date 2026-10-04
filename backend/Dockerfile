# Polis Feedback plugin — backend container.
#
# A tiny, dependency-free Node HTTP service. The image is what the controller
# (client-driver) runs when the plugin is enabled; the manifest's `image` field
# points at the published tag.
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

# No runtime deps — copy package manifest (for metadata/engines) and source.
COPY package.json ./
COPY src ./src

# Run as the built-in non-root node user.
USER node

EXPOSE 8080

# Liveness: the service exposes GET /healthz.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "src/server.js"]
