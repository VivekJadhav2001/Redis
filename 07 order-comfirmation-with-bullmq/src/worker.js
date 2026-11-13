import { Worker } from "bullmq"
import {connection} from "./queue.js"


const emailWorker = new Worker(
    "emails",
    async (job)=>{
        console.log("Processing Email Job....", job.id, job.name,job.data)
        await new Promise((resolve)=> setTimeout(resolve,1500))
        console.log("Email job Completed",job.id, job.name,job.data)
    },
    {connection}
)


emailWorker.on("completed",(job)=>{
    console.log("JOB Completed",job.id, job.name,job.data)
})

emailWorker.on("failed",(job)=>{
    console.log('JOB Failed',job.id, job.name,job.data)
})


export {
    emailWorker
}


