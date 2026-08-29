FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
RUN npm install prisma
COPY . .
RUN npx prisma generate
EXPOSE 3001
CMD ["npm", "run", "dev"]