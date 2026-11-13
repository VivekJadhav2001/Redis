import express from "express";
import Redis from 'ioredis';

const app = express();
app.use(express.json());

const redis = new Redis("redis://localhost:6379");


//Banner Key is important to be unique for each banner, so we can use the banner ID as the key
//this banner key can be kept in env or constants
const BANNER_KEY = "app:banner";

app.post("/banner",async (req,res)=>{

    await redis.set(BANNER_KEY,req.body.message || "Welcome to our site!");

    res.json({success:true,message:"Banner message set successfully!"})
})

app.get("/banner",async (req,res)=>{
    const message = await redis.get(BANNER_KEY);    

    res.json({success:true,message:message || "No banner message set!"})
})  

app.delete("/banner",async (req,res)=>{
    await redis.del(BANNER_KEY);
    res.json({success:true,message:"Banner message deleted successfully!"})
})

app.get("/banner/exists",async (req,res)=>{
    const exists = await redis.exists(BANNER_KEY);
    res.json({success:true,exists:exists}) //!! converts the number returned by exists to a boolean !!exists => Boolean(exists)
})


app.listen(3000,()=>{
    console.log("Server is running on port 3000");
})