FROM node:20-alpine
# tzdata: TZ=Europe/Istanbul değişkeninin Node içinde gerçekten etkili olması için
RUN apk add --no-cache tzdata
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 8000
CMD ["npm", "start"]
