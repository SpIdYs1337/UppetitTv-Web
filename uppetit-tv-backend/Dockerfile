FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm install
RUN npm install prisma@5 @prisma/client@5
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "dev"]