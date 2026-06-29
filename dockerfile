#FROM node:18-alpine
#WORKDIR /app
#COPY package*.json ./
#RUN npm install
#COPY . .
#EXPOSE 3001
#CMD ["npm", "start"]

# Utiliser une image Node.js
FROM node:18-alpine

# Définir le répertoire de travail
WORKDIR /app

# Copier les fichiers de l'application
COPY package*.json ./
COPY . .

# Copier les certificats SSL dans le conteneur

# Installer les dépendances
RUN npm install

# Exposer le port HTTPS
EXPOSE 3335

# Démarrer l'application
CMD ["npm","start"]