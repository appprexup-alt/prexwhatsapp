# Dockerfile para CRM-WhatsApp
# Combinamos el build del frontend y el servidor de WhatsApp

# FASE 1: Build del Frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

# FASE 2: Servidor de Producción (Nginx + Node)
# Usaremos una imagen base de Node y configuraremos Nginx o simplemente correremos el backend
# Para simplicidad, usaremos Docker Compose para separar Nginx y el Servidor Node.

# Este Dockerfile se usará para el SERVICE BACKEND (whatsapp-server)
FROM node:20-alpine
WORKDIR /app
COPY whatsapp-server/package*.json ./
RUN npm install
COPY whatsapp-server/ .
CMD ["node", "index.js"]
