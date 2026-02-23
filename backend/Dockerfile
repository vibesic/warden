FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

# Generate Prisma client and push schema to SQLite
RUN npx prisma generate

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run dev"]
