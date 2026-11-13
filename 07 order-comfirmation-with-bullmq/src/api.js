import express from "express"
import Redis from "ioredis"
import { emailQueue } from "./queue.js"

const app = express()
app.use(express.json())

const redis = new Redis("redis://localhost:6379")

app.post("/welcome-email", async (req, res) => {
  const job = await emailQueue.add(
    "send-welcome-email",
    {
      to: req.body.to,
      name: req.body.name,
      subject: req.body.subject,
    },
    {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    }
  );

  return res.json({
  message: "Email queued",
  jobId: job.id,
  jobName: job.name,
  job:job
});
});



app.listen(4001,()=>console.log("Server is running on port http://localhost:4001"))