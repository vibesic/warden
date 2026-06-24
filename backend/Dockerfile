FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma client
RUN npx prisma generate

# Create data directory for SQLite and run migrations during image build
RUN mkdir -p /app/data
RUN DATABASE_URL="file:/app/data/dev.db" npx prisma migrate deploy

EXPOSE ${PORT:-4444}

CMD ["npm", "run", "dev"]
