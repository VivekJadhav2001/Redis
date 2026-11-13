import { redis } from "../config/redis.js"

const rateLimiter = async (req, res, next) => {

    // Get the client's IP address.
    // This is how we'll identify each user.
    const ip = req.ip;

    // Create a unique Redis key for this IP.
    // Example:
    // rate:::1
    // rate:192.168.1.10
    const key = `rate:${ip}`;

    // INCR does two things:
    // 1. If the key doesn't exist, Redis creates it with value 1.
    // 2. If it already exists, Redis increments it by 1.
    //
    // Example:
    // First request  -> 1
    // Second request -> 2
    // Third request  -> 3
    const requests = await redis.incr(key);

    // If this is the user's FIRST request,
    // start a 60-second timer for this key.
    //
    // After 60 seconds, Redis automatically deletes the key.
    //
    // We only set EXPIRE once.
    // If we set it on every request, the timer would keep resetting,
    // meaning the user could remain blocked indefinitely.
    if (requests === 1) {
        await redis.expire(key, 60);
    }

    // If the request count exceeds our limit (5),
    // reject the request with HTTP 429 (Too Many Requests).
    if (requests > 5) {
        return res.status(429).json({
            message: "Too many requests"
        });
    }

    // If the user is within the limit,
    // continue to the next middleware or route handler.
    next();
};

export {
    rateLimiter
}
