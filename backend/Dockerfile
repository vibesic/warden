FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma client and push schema to SQLite
RUN npx prisma generate

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE ${PORT:-4444}

CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && npm run dev"]
