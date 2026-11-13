import express from "express"
import { rateLimiter } from "./middleware/rateLimiter.middleware.js"

const app = express()

app.use(express.json())

app.use(rateLimiter)

app.get("/rateLimiting",(req,res)=>{
    return res.json({success:true,message:"This is Rate limiting Route!!!"})
})

app.listen(4001,()=>console.log("Server Running on URL http://localhost:4001"))