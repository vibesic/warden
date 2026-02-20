FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

# Install dependencies (System + Node)
RUN apk add --no-cache openssl && \
    npm install

COPY . .

# Generate Prisma client
RUN npx prisma generate

EXPOSE 3000

CMD ["npm", "run", "dev"]
