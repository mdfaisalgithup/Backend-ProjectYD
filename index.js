

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


         
   const hdMp4Formats = Array.from(
  new Map(
    info.formats
      .filter(format =>
        format.container === 'mp4' &&
        format.qualityLabel &&
        ['144','240','360','480','720','1080','1440','2160'].some(q => format.qualityLabel.includes(q)) &&
        format.hasVideo
      )
      .map(format => [
        format.qualityLabel, // deduplicate by qualityLabel instead of itag
        {
          itag: format.itag,
          qualityLabel: format.qualityLabel,
          quality: format.quality || 'Unknown',
          url: format.url,
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
          .filter(audioFor => audioFor.hasAudio && !audioFor.hasVideo && audioFor.container === 'mp4')
          .map(audioFor => [
            audioFor.itag,
            {
              itag: audioFor.itag,
              quality: audioFor.quality || 'Unknown',
              url: audioFor.url,
              bitrate: audioFor.bitrate,
              audioQuality: audioFor.audioQuality,
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
    const  { formataData, socketId }  = req.body;

    const videoFormatsT = formataData[0]; // object with url property
    const audioFormatsT = formataData[1]; // object with url property
    const videoPageUrl = formataData[2]; // youtube video page url string

    // const sizeVS =
    //   parseFloat(videoFormatsT.size) + parseFloat(audioFormatsT.size);
   


    const videoTemp = path.join(os.tmpdir(), "video_temp.mp4");
    const audioTemp = path.join(os.tmpdir(), "audio_temp.mp3");
    const outputFile = path.join(os.tmpdir(), "merged_output.mp4");

    // info
    const info = await ytdl.getInfo(videoPageUrl);

    // video filter
    const videoFormats = info?.formats.filter(
      (f) =>
        (f.itag === videoFormatsT.itag &&
          f.qualityLabel === videoFormatsT.qualityLabel) ||
        f.url === videoFormatsT.url
    );



    if (videoFormats.length === 0) {
      throw new Error("No suitable video format found");
    }
    const videoFormat = videoFormats[0];



    // audio filter
    const audioFormats = info?.formats.filter(
      (a) =>
        (a.itag === audioFormatsT.itag &&
          a.audioQuality === audioFormatsT.audioQuality) ||
        a.url === audioFormatsT.url
    );

    if (audioFormats.length === 0) {
      throw new Error("No suitable audio format found");
    }

    // pick best audio
    const audioFormat = audioFormats.reduce((prev, curr) =>
      (curr.bitrate || 0) > (prev.bitrate || 0) ? curr : prev
    );

    // streams
    const videoStream = ytdl.downloadFromInfo(info, { format: videoFormat });
    const audioStream = ytdl.downloadFromInfo(info, { format: audioFormat });

    // write streams
    const videoWriteStream = fs.createWriteStream(videoTemp);
    const audioWriteStream = fs.createWriteStream(audioTemp);

  


let videoDownloaded = 0;
let audioDownloaded = 0;

// ---- Video progress ----
videoStream.on("data", (chunk) => {
  videoDownloaded += chunk.length;

  const videoMB = (videoDownloaded / (1024 * 1024)).toFixed(2);
  const audioMB = (audioDownloaded / (1024 * 1024)).toFixed(2);
  const totalMB = (parseFloat(videoMB) + parseFloat(audioMB)).toFixed(2);

  io.to(socketId).emit("videokoto", {
    video: videoMB,
    audio: audioMB,
    total: totalMB,
  });
});
videoStream.pipe(videoWriteStream);

// ---- Audio progress ----
audioStream.on("data", (chunk) => {
  audioDownloaded += chunk.length;

  const videoMB = (videoDownloaded / (1024 * 1024)).toFixed(2);
  const audioMB = (audioDownloaded / (1024 * 1024)).toFixed(2);
  const totalMB = (parseFloat(videoMB) + parseFloat(audioMB)).toFixed(2);

  io.to(socketId).emit("videokoto", {
    video: videoMB,
    audio: audioMB,
    total: totalMB,
  });
});
audioStream.pipe(audioWriteStream);



    await Promise.all([
      new Promise((res) => videoWriteStream.on("finish", res)),
      new Promise((res) => audioWriteStream.on("finish", res)),
    ]);

    // merge with ffmpeg
  await new Promise((resolve, reject) => {
  ffmpeg()
    .input(videoTemp)
    .input(audioTemp)
    .outputOptions([
      "-c:v libx264",   // re-encode video to H.264 (widely compatible)
      "-c:a aac",       // encode audio to AAC
      "-preset veryfast", // optional: faster encoding
      "-shortest"       // trim to shortest input
    ])
    .save(outputFile)
    .on("end", () => {
      console.log("Merge finished!");
      resolve();
    })
    .on("error", (err) => {
      console.error("FFmpeg error:", err);
      reject(err);
    });
});


    const fileBuffer = fs.readFileSync(outputFile);

    // cleanup
    fs.unlinkSync(videoTemp);
    fs.unlinkSync(audioTemp);
    fs.unlinkSync(outputFile);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="merged_video.mp4"'
    );
    res.setHeader("Content-Length", fileBuffer.byteLength);

    res.send(fileBuffer);
  } catch (error) {
    console.error(error);
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
