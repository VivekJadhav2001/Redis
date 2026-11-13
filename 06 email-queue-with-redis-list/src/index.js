import express from "express"
import Redis from "ioredis"

const app = express()
app.use(express.json())

const redis = new Redis("redis://localhost:6379")
const QUEUE_KEY = "queue:email"


//TO Send EMAIL's
app.post("/emails", async (req,res)=>{
    const {toEmail,subject,body} = req.body
    const job = {
        to: toEmail,
        subject:subject || "No Object",
        body:body || "No Content",
        createdAt: new Date().toLocaleString()
    }

    await redis.lpush(QUEUE_KEY,JSON.stringify(job))

    return res.json({queued:true,job})
})

app.get("/emails/process-one",async(req,res)=>{
    const rawJob = await redis.rpop(QUEUE_KEY)

    const job = JSON.parse(rawJob)
    //Simulate sending email
    res.json({message:"Email Send",job})
})

app.listen(3001,()=>console.log("Server is running on port http://localhost:3001"))