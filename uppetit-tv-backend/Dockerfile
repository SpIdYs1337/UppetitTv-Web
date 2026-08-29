FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
# Жестко фиксируем классическую версию Prisma ORM
RUN npm install prisma@5 @prisma/client@5
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "dev"]