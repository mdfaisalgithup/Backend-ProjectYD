

import express from "express";
import cors from "cors";
import ytdl from "@distube/ytdl-core";
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';


import http from 'http';
import { Server } from 'socket.io';
import ffmpegPath from "ffmpeg-static";
ffmpeg.setFfmpegPath(ffmpegPath);


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",       // testing e sob origin allow
    methods: ["GET", "POST"]
  }
});


const port = 5000;

app.use(cors());
app.use(express.json());









app.post('/api/folo', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || !ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'Invalid or missing YouTube URL' });
    }

    const info = await ytdl.getInfo(url);

    function formatDuration(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    const videoDuration = formatDuration(parseInt(info.videoDetails.lengthSeconds));




          // ['144p','240p','360p','480p','720p','1080p','1440p','2160p']
   const hdMp4Formats = Array.from(
  new Map(
    info.formats
      .filter(format =>
        format.container === 'mp4' &&
        format.qualityLabel &&
        ['144p','240p','360p','480p','720p','1080p','1440p','2160p'].some(q => format.qualityLabel.includes(q)) &&
        format.hasVideo == true && format.url
      )
      .map(format => [
        format.qualityLabel, // deduplicate by qualityLabel instead of itag
        {
          itag: format.itag,
          qualityLabel: format.qualityLabel,
          quality: format.quality || 'Unknown',
          url: format.url,
          hasVideo: format.hasVideo,
          size: format.contentLength
            ? (parseInt(format.contentLength) / (1024 * 1024)).toFixed(2)
            : 'Unknown',
          duration: videoDuration,
        }
      ])
  ).values()
);






    const thumbnail = info.videoDetails.thumbnails.slice(-1)[0].url;



  
    const audioFormats = Array.from(
      new Map(
        info.formats
          .filter(audioFor => audioFor.hasAudio == true && !audioFor.hasVideo)
          .map(audioFor => [
            audioFor.itag,
            {
              itag: audioFor.itag,
              quality: audioFor.quality || 'Unknown',
              url: audioFor.url,
              bitrate: audioFor.bitrate,
              audioQuality: audioFor.audioQuality,
              hasAudio: audioFor.hasAudio,
              size: audioFor.contentLength
                ? (parseInt(audioFor.contentLength) / (1024 * 1024)).toFixed(2)
                : 'Unknown',
              duration: audioFor.approxDurationMs
                ? (audioFor.approxDurationMs / 1000 / 60).toFixed(2)
                : 'Unknown',
            }
          ])
      ).values()
    );




    if (audioFormats.length === 0) {
      throw new Error('No suitable audio format found');
    }

    const audioFormat = audioFormats.reduce((prev, curr) =>
      (curr.bitrate || 0) > (prev.bitrate || 0) ? curr : prev
    );

    const ausioSizesFor = parseFloat(audioFormat?.size).toFixed(2);



    res.json({
      title: info.videoDetails.title,
      formats: hdMp4Formats,
      audioFormat: audioFormat,
      videoUrl: url,
      vthumbnail: thumbnail,
      ausioSizesFor: ausioSizesFor
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



// GET route
app.get('/api/folo', (req, res) => {
  res.json({ msg: "Hello GET working!" });
});







// GET route



app.post("/download", async (req, res) => {
  try {
    const { formataData, socketId } = req.body;

    const videoFormatsT = formataData[0];
    const audioFormatsT = formataData[1];
    const videoPageUrl = formataData[2];

    const videoTemp = path.join(os.tmpdir(), "video_temp.mp4");
    const audioTemp = path.join(os.tmpdir(), "audio_temp.mp3");
    const outputFile = path.join(os.tmpdir(), "merged_output.mp4");

    const info = await ytdl.getInfo(videoPageUrl);

    // ----------------- Video Filter -----------------
    const videoFormat = info.formats.find(
      f => f.itag === videoFormatsT.itag || f.url === videoFormatsT.url
    );
    if (!videoFormat) throw new Error("No suitable video format found");

    // ----------------- Audio Filter -----------------
    const audioFormat = info.formats.find(
      a => a.itag === audioFormatsT.itag || a.url === audioFormatsT.url
    );
    if (!audioFormat) throw new Error("No suitable audio format found");

    // ----------------- Download Streams -----------------
    let videoDownloaded = 0;
    let audioDownloaded = 0;

    const videoStream = ytdl.downloadFromInfo(info, { format: videoFormat });
    const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });

    const videoWriteStream = fs.createWriteStream(videoTemp);
    const audioWriteStream = fs.createWriteStream(audioTemp);

    // Video progress
    videoStream.on("data", chunk => {
      videoDownloaded += chunk.length;
      const videoMB = (videoDownloaded / (1024 * 1024)).toFixed(2);
      const audioMB = (audioDownloaded / (1024 * 1024)).toFixed(2);
      io.to(socketId).emit("videokoto", {
        video: videoMB,
        audio: audioMB,
        total: (parseFloat(videoMB) + parseFloat(audioMB)).toFixed(2)
      });
    });
    videoStream.pipe(videoWriteStream);

    // Audio progress
    audioStream.on("data", chunk => {
      audioDownloaded += chunk.length;
      const videoMB = (videoDownloaded / (1024 * 1024)).toFixed(2);
      const audioMB = (audioDownloaded / (1024 * 1024)).toFixed(2);
      io.to(socketId).emit("videokoto", {
        video: videoMB,
        audio: audioMB,
        total: (parseFloat(videoMB) + parseFloat(audioMB)).toFixed(2)
      });
    });
    audioStream.pipe(audioWriteStream);

    // Wait until both downloads finish
    await Promise.all([
      new Promise(res => videoWriteStream.on("close", res)),
      new Promise(res => audioWriteStream.on("close", res))
    ]);

    // ----------------- Merge -----------------
    // await new Promise((resolve, reject) => {
    //   ffmpeg()
    //     .input(videoTemp)
    //     .input(audioTemp)
    //     .outputOptions(["-c:v libx264", "-preset veryfast", "-c:a aac", "-shortest"])
    //     .save(outputFile)
    //      .on("end", () => {
    //   // Merge finished → send socket message
    //   io.to(socketId).emit("mergeStatus", { status: "finished", message: "✅ Video & audio merged successfully!" });
    //   resolve();
    // })
    //     .on("error", reject);
    // });


    await new Promise((resolve, reject) => {
  ffmpeg()
    .input(videoTemp)
    .input(audioTemp)
    .outputOptions(["-c:v libx264", "-preset ultrafast", "-c:a aac", "-shortest"])
    .on("progress", (progress) => {
      // progress.percent gives approximate merge completion
      io.to(socketId).emit("mergeProgress", {
        percent: progress.percent ? progress.percent.toFixed(2) : 0,
        timemark: progress.timemark
      });
    })
    .on("end", () => {
      io.to(socketId).emit("mergeStatus", { status: "finished", message: "Merge complete!" });
      resolve();
    })
    .on("error", (err) => {
      io.to(socketId).emit("mergeStatus", { status: "error", message: "Merge failed", error: err.message });
      reject(err);
    })
    .save(outputFile);
});

    // ----------------- Send Response -----------------
    const fileBuffer = fs.readFileSync(outputFile);

    fs.unlinkSync(videoTemp);
    fs.unlinkSync(audioTemp);
    fs.unlinkSync(outputFile);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Content-Disposition", 'attachment; filename="merged_video.mp4"');
    res.setHeader("Content-Length", fileBuffer.byteLength);

    res.send(fileBuffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});




io.on('connection', (socket) => {
console.log('User connected:', socket.id);




  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });




})

server.listen(port, () => {
  console.log(`Server running on ${port}`);
});
