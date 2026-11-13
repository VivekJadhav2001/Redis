import express from "express";
import Redis from 'ioredis';

const app = express();
app.use(express.json());


const redis = new Redis("redis://localhost:6379");

function getOtpKey(phone){
    return `otp:${phone}`;
}

app.post("/generateOtp",async (req,res)=>{
    const {phone} = req.body;

    if(!phone){
        return res.status(400).json({success:false,message:"Phone number is required!"})
    }

    const otp = Math.floor(100000 + Math.random() * 900000); //generate a 6 digit random number

    await redis.set(getOtpKey(phone),otp,"EX",30); //set the otp in redis with an expiry of 30 seconds

    res.json({success:true,message:"OTP sent successfully!",otp:otp})
})

app.get("/otp/verify",async (req,res)=>{
    const {phone,otp} = req.body;

    const savedOtp = await redis.get(getOtpKey(phone));

    if(!savedOtp){
        return res.status(400).json({success:false,message:"OTP expired or not found!"})
    }

    if(savedOtp !== otp){
        return res.status(400).json({success:false,message:"Invalid OTP!"})
    }

    await redis.del(getOtpKey(phone)); //delete the otp after successful verification

    res.json({success:true,message:"OTP verified successfully!"})


})

app.get("/otp/:phone/ttl",async (req,res)=>{
    const {phone} = req.params;

    const ttl = await redis.ttl(getOtpKey(phone));

    res.json({ttl:ttl}) //ttl will be -2 if the key does not exist, -1 if the key exists but has no associated expire
})


app.listen(3001,()=>{
    console.log("Server is running on port http://localhost:3001");
})