# Step 1: Base image
FROM node:20

# Step 2: Install ffmpeg (system-wide)
RUN apt-get update && apt-get install -y ffmpeg

# Step 3: Set working directory
WORKDIR /app

# Step 4: Copy package files
COPY server/package*.json ./

# Step 5: Install dependencies
RUN npm install

# Step 6: Copy backend files
COPY server/ ./

# Step 7: Expose port
EXPOSE 5000

# Step 8: Set ffmpeg path for fluent-ffmpeg
ENV FFMPEG_PATH=/usr/bin/ffmpeg

# Step 9: Start backend server
CMD ["npm", "start"]
