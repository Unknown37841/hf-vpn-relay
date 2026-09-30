FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY hf_server.js ./server.js
EXPOSE 7860
CMD ["node", "server.js"]
