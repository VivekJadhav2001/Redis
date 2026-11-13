import express from "express"
import Redis from "ioredis"

const app = express()
app.use(express.json())
const redis = new Redis("redis://localhost:6379")

function getUserKeyForJson(id){
    return `user:${id}:json`
}
function getUserKeyForHash(id){
    return `user:${id}:hash`
}

console.log("RUNNING")

//STORING USER DATA IN JSON FORMAT
app.post("/user/:id/json",async (req,res)=>{
    const id = req.params.id
    await redis.set(getUserKeyForJson(id), JSON.stringify(req.body))

    res.json({savedAs:"Json"})
})


app.get("/user/:id/json",async (req,res)=>{
    const id = req.params.id
    const raw = await redis.get(getUserKeyForJson(id))

    res.json({data: raw ? JSON.parse(raw):null})
})



//STORING USER DATA IN HASH FORMAT
app.post("/user/:id/hash",async(req,res)=>{
    const id = req.params.id 

    await redis.hset(getUserKeyForHash(id),req.body)

    res.json({savedAs : "hash"})
})


app.get("/user/:id/hash",async(req,res)=>{
    const id = req.params.id 

    const user = await redis.hgetall(getUserKeyForHash(id))
    res.json({user})
})



app.listen(3001,()=>console.log("Server is running on port http://localhost:3001"))