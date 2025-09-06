

import express from "express";
import cors from "cors";

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

let clients = []; // SSE 
let latestProgress = 0; // শেষ 

// SSE 
app.get("/progress-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");


  clients.push(res);


  res.write(`data: ${JSON.stringify({ total: latestProgress })}\n\n`);

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});


app.post("/progress", (req, res) => {
  let { total } = req.body;
  total = parseFloat(total);

  if (isNaN(total)) {
    return res.status(400).json({ success: false });
  }

  latestProgress = total;


  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify({ total })}\n\n`);
  });

  res.json({ success: true });
});



app.get("/totalfilefizes", (req, res) => {




 } )


// .............

app.get("/progress-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();


  clients.push(res);


  res.write(`data: ${JSON.stringify({ total: latestTotal })}\n\n`);

  req.on("close", () => {
    clients = clients.filter((c) => c !== res);
  });
});

 // POST total-size API
app.post("/total-size", (req, res) => {
  let { TotalSize } = req.body;
  size = parseFloat(TotalSize);

  if (isNaN(size)) {
    return res.status(400).json({ success: false, message: "Invalid size value" });
  }

  latestTotal = size;


  clients.forEach((client) => {
    client.write(`data: ${JSON.stringify({ total: size })}\n\n`);
  });

  res.json({ success: true, total: size });
})


app.listen(port, () => {
  console.log(`🚀 Server running on ${port}`);
});
