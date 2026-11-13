# Redis + BullMQ — Revision Notes

Hands-on notes for revising Redis and BullMQ fundamentals, based on the small projects in this repo.

- [Part 1 — Redis](#part-1--redis)
- [Part 2 — BullMQ](#part-2--bullmq)
- [Project map](#project-map)
- [Self-quiz](#self-quiz-active-recall)

---

## ⚡ 5-minute crash sheet (read this first)

If you only remember 10 things:

1. **Redis = super-fast key-value store living in RAM.** Keys are strings; use `namespace:key` (e.g. `otp:9988`).
2. **It's fast because it's in memory**; it's single-threaded, so every command is atomic.
3. **`SET key value EX 30`** = store + auto-expire in 30s. Perfect for OTPs/sessions.
4. **`TTL`** returns seconds left, `-1` = no expiry, `-2` = key doesn't exist.
5. **Cache-aside pattern:** read cache → miss? read DB → write cache with a TTL.
6. **JSON string vs Hash:** JSON = whole object in one key; Hash = per-field values, cheap partial updates.
7. **`LPUSH` + `RPOP`** on a list = a simple FIFO queue (producer pushes left, worker pops right).
8. **Rate limit** = `INCR` a per-IP key + `EXPIRE` **once** on the first hit; over limit → HTTP `429`.
9. **BullMQ = a job queue on top of Redis** that adds retries, backoff, delays, priorities, monitoring.
10. **BullMQ needs three things:** a `Queue` (add jobs), a `Worker` (process jobs), and a **matching queue name** + Redis connection.

**Mental model:** Redis is a lightning-fast locker of labeled boxes. BullMQ is a post office built on those boxes — you drop letters in, workers deliver them, and failed letters get retried.

---

# Part 1 — Redis

## What is Redis?

Redis is an **in-memory key-value store** (often used as a cache, message broker, session store, and database). It is extremely fast because data lives in RAM.

Key properties:

- **In-memory** → very fast reads/writes.
- **Key-value** with rich data types (strings, hashes, lists, sets, sorted sets, etc.).
- **Single-threaded** command execution → commands are atomic.
- **Optional persistence** (RDB snapshots / AOF append-only file).
- **TTL support** → keys can expire automatically.
- Typical uses: caching, OTP/session storage, rate limiting, queues, leaderboards, counters.

## Running Redis locally

This repo uses Docker Compose (`docker-compose.yml`) with Redis 7 and MongoDB:

```bash
docker compose up -d
```

Connect with the CLI:

```bash
docker exec -it chai-aur-redis redis-cli
ping          # PONG
set name "chai"
get name
del name
```

Connection string used across the projects:

```
redis://localhost:6379
```

## Connecting from Node.js (`ioredis`)

```js
import Redis from "ioredis";

const redis = new Redis("redis://localhost:6379");
```

## Basic commands (cheat sheet)

| Task | Command | Example |
| --- | --- | --- |
| Health check | `PING` | `redis.ping()` → `"PONG"` |
| Set value | `SET` | `redis.set("app:banner", "Hello")` |
| Get value | `GET` | `redis.get("app:banner")` |
| Delete key | `DEL` | `redis.del("app:banner")` |
| Check existence | `EXISTS` | `redis.exists(key)` → `1` / `0` |
| Set with expiry | `SET ... EX` | `redis.set(key, val, "EX", 30)` |
| Time to live | `TTL` | `redis.ttl(key)` |
| Increment | `INCR` | `redis.incr(key)` |
| Set expiry | `EXPIRE` | `redis.expire(key, 60)` |
| Push to list | `LPUSH` / `RPUSH` | `redis.lpush(key, val)` |
| Pop from list | `LPOP` / `RPOP` | `redis.rpop(key)` |
| Hash set (many) | `HSET` | `redis.hset(key, obj)` |
| Hash get all | `HGETALL` | `redis.hgetall(key)` |

## Note: keys and naming

Use **namespaced / colon-separated keys** to avoid collisions and make scanning easy:

```
app:banner
otp:9876543210
user:42:json
user:42:hash
queue:email
rate:127.0.0.1
```

## Pattern 1 — Simple cache (site banner)

`03 site banner` — set / get / delete / exists on a single key.

```js
const BANNER_KEY = "app:banner";

await redis.set(BANNER_KEY, "Welcome!");   // write
const msg = await redis.get(BANNER_KEY);   // read
await redis.del(BANNER_KEY);               // delete
const exists = await redis.exists(BANNER_KEY); // 1 or 0
```

**Revision points**

- `get` returns `null` when the key is missing → always handle the null case.
- `exists` returns a **number** (`1`/`0`), convert with `Boolean(exists)`.
- `del` returns the number of keys removed.

## Pattern 2 — OTP with TTL

`04 login-otp-with-ttp` — store a one-time password that auto-expires.

```js
// generate
const otp = Math.floor(100000 + Math.random() * 900000); // 6 digits
await redis.set(`otp:${phone}`, otp, "EX", 30);          // expires in 30s

// verify
const saved = await redis.get(`otp:${phone}`);
if (!saved) return res.status(400).json({ message: "OTP expired or not found" });

// on success, delete so it can't be reused
await redis.del(`otp:${phone}`);

// inspect remaining time
const ttl = await redis.ttl(`otp:${phone}`);
```

**TTL return values (important for exams/interviews):**

| Value | Meaning |
| --- | --- |
| `> 0` | Seconds remaining |
| `-1` | Key exists but has **no** expiry |
| `-2` | Key does **not** exist |

**Revision points**

- `SET key value EX seconds` sets value + expiry atomically (better than `SET` + separate `EXPIRE`).
- Delete OTP after successful verification to prevent replay.

## Pattern 3 — JSON string vs Hash (user profile cache)

`05 user-profile-cache-json-vs-hash` — two ways to store an object.

**As a JSON string** (one key, whole object serialized):

```js
await redis.set(`user:${id}:json`, JSON.stringify(body));
const raw = await redis.get(`user:${id}:json`);
const data = raw ? JSON.parse(raw) : null;
```

**As a hash** (field → value pairs):

```js
await redis.hset(`user:${id}:hash`, req.body);   // object of fields
const user = await redis.hgetall(`user:${id}:hash`); // { field: value }
```

**When to use which**

| | JSON string | Hash |
| --- | --- | --- |
| Read whole object | ✅ simple | ✅ |
| Update one field | ❌ rewrite whole string | ✅ `HSET key field val` |
| Nested data | ✅ natural | ❌ flat only |
| Memory / overhead | Higher (serialize/parse) | Lower for partial access |
| Use when | Small blobs, nested objects, opaque data | User/session objects read/updated per-field |

**Revision points**

- Hash values come back as **strings** — cast numbers/booleans yourself.
- `hgetall` returns `{}` for a missing key (not `null`).

## Pattern 4 — Queue with a Redis list

`06 email-queue-with-redis-list` — a minimal job queue using `LPUSH` + `RPOP` (FIFO).

```js
const QUEUE_KEY = "queue:email";

await redis.lpush(QUEUE_KEY, JSON.stringify(job)); // producer (left)
const raw = await redis.rpop(QUEUE_KEY);           // consumer (right)
const job = raw ? JSON.parse(raw) : null;
```

- `LPUSH` + `RPOP` = **FIFO** (first in, first out).
- `LPUSH` + `LPOP` = **LIFO** (stack).
- This is a *manual* queue: no retries, no scheduling, no monitoring. Use BullMQ for production.

## Pattern 5 — Rate limiting (fixed window)

`Rate Limiting with redis` — limit requests per IP per time window with `INCR` + `EXPIRE`.

```js
const key = `rate:${req.ip}`;
const requests = await redis.incr(key);      // atomic increment / create

if (requests === 1) {
  await redis.expire(key, 60);               // start the window only once
}

if (requests > 5) {
  return res.status(429).json({ message: "Too many requests" });
}
next();
```

**Revision points**

- `INCR` is atomic → safe for concurrent requests.
- Set `EXPIRE` **only on the first request**; resetting it every request would extend the window forever.
- This is a **fixed-window** limiter (simple, but allows bursts at window edges). Alternatives: sliding window, token bucket, leaky bucket.
- HTTP `429` = Too Many Requests.

## Useful Redis concepts to remember

- **Atomicity:** single commands are atomic; combine multi-step logic with transactions (`MULTI/EXEC`) or **Lua scripts** for true atomicity.
- **Persistence:** RDB = periodic snapshots, AOF = append every write (safer). `--appendonly yes` is enabled in `docker-compose.yml`.
- **Eviction:** when memory is full, keys can be evicted by a policy (`maxmemory-policy`, e.g. `allkeys-lru`).
- **Cache-aside:** read cache → on miss, read DB → write back to cache with a TTL. This is the pattern all the cache examples follow.
- **SCAN vs KEYS:** use `SCAN` in production; `KEYS` blocks the server.

---

# Part 2 — BullMQ

## What is BullMQ?

BullMQ is a **Node.js job queue library built on top of Redis**. It handles what a raw Redis list does not: retries, backoff, scheduling, priorities, concurrency, progress, and a dashboard.

It consists of three roles:

| Role | What it does |
| --- | --- |
| **Queue** (producer) | Adds jobs to Redis |
| **Worker** (consumer) | Picks up and processes jobs |
| **QueueEvents / events** | Lets you listen for `completed`, `failed`, etc. |

All three share the **same Redis connection config and the same queue name**.

## Core concepts

- **Queue** — a named stream of jobs (e.g. `"emails"`).
- **Job** — a unit of work with `name` + `data` + options; gets an `id`.
- **Worker** — a process that runs your handler for each job.
- **Job states** — `waiting`, `active`, `completed`, `failed`, `delayed`, `prioritized`, `repeatable`, `waiting-children`.
- **attempts** — how many times to retry a failing job.
- **backoff** — delay strategy between retries (`fixed` or `exponential`).

## Setup (project `07`)

Install:

```bash
npm install bullmq ioredis
```

Shared connection + queue — `src/queue.js`:

```js
import { Queue } from "bullmq";

const connection = { host: "localhost", port: 6379 };

const emailQueue = new Queue("emails", { connection });

export { connection, emailQueue };
```

> The queue name (`"emails"`) is the link between producer and worker. If they differ, jobs never get processed.

## Producer — adding jobs (`src/api.js`)

```js
const job = await emailQueue.add(
  "send-welcome-email",          // job name
  { to, name, subject },         // job data (payload)
  {
    attempts: 3,                 // retry up to 3 times
    backoff: {
      type: "exponential",       // 1s, 2s, 4s, ...
      delay: 1000,               // base delay in ms
    },
  }
);
// job.id, job.name
```

**Job options worth remembering**

| Option | Purpose |
| --- | --- |
| `attempts` | Number of retries on failure |
| `backoff` | Delay between retries (`fixed` / `exponential`) |
| `delay` | Wait N ms before the job becomes available |
| `priority` | Higher priority runs first (lower number = higher priority) |
| `removeOnComplete` | Auto-remove finished jobs (bool or count) |
| `removeOnFail` | Auto-remove failed jobs |
| `jobId` | Custom id → used for de-duplication |

## Worker — processing jobs (`src/worker.js`)

```js
import { Worker } from "bullmq";
import { connection } from "./queue.js";

const emailWorker = new Worker(
  "emails",
  async (job) => {
    console.log("Processing", job.id, job.name, job.data);
    await new Promise((r) => setTimeout(r, 1500)); // simulate work
  },
  { connection }
);

emailWorker.on("completed", (job) => console.log("Completed", job.id));
emailWorker.on("failed", (job) => console.log("Failed", job.id));
```

**Revision points**

- The worker handler can be `async`; BullMQ waits for it to resolve.
- If the handler **throws**, the job goes to `failed` and is retried according to `attempts`/`backoff`.
- Workers are long-running processes — run them separately from your API (`node src/worker.js`).
- Scale throughput by running **multiple workers** (concurrency) or setting `{ concurrency: N }` on one worker.

## Queue events

For richer events (including async failures and `retries`), use `QueueEvents`:

```js
import { QueueEvents } from "bullmq";

const events = new QueueEvents("emails", { connection });
events.on("completed", ({ jobId }) => console.log("done", jobId));
events.on("failed", ({ jobId, failedReason }) =>
  console.log("failed", jobId, failedReason)
);
```

## BullMQ vs a raw Redis list

| | Redis list queue | BullMQ |
| --- | --- | --- |
| FIFO | ✅ (`LPUSH`+`RPOP`) | ✅ |
| Retries / backoff | ❌ manual | ✅ built-in |
| Delayed / scheduled jobs | ❌ | ✅ |
| Priorities | ❌ | ✅ |
| Progress & monitoring | ❌ | ✅ (incl. Bull Board) |
| Crash recovery / stalled jobs | ❌ manual | ✅ |
| Use when | Learning, trivial jobs | Real production queues |

## Common pitfalls

- **Different queue names** in `Queue` and `Worker` → nothing processes.
- **Connection options** must match between queue and worker.
- **Unhandled throws** cause retries; guard against non-idempotent side effects (emails, payments) — make jobs idempotent.
- Forgetting to **run the worker** process → jobs pile up in `waiting`.
- `ioredis` with `maxRetriesPerRequest: null` is recommended for BullMQ connections in some setups (BullMQ requires blocking commands).

---

# Project map

| Folder | Topic | Key Redis/BullMQ features |
| --- | --- | --- |
| `02 setup local redis` | Connect Redis + MongoDB | `PING`, Docker setup |
| `03 site banner` | Simple cache | `SET`, `GET`, `DEL`, `EXISTS` |
| `04 login-otp-with-ttp` | OTP with expiry | `SET ... EX`, `TTL`, `DEL` |
| `05 user-profile-cache-json-vs-hash` | Caching objects | `SET`/`GET` JSON vs `HSET`/`HGETALL` |
| `06 email-queue-with-redis-list` | Manual queue | `LPUSH`, `RPOP` |
| `07 order-comfirmation-with-bullmq` | Job queue | `Queue`, `Worker`, `attempts`, `backoff` |
| `Rate Limiting with redis` | Rate limiting | `INCR`, `EXPIRE`, `429` |

## Quick run reference

```bash
# start Redis + Mongo
docker compose up -d

# any example
cd "03 site banner"
npm install        # or pnpm install
npm run dev

# BullMQ example needs BOTH processes
cd "07 order-comfirmation-with-bullmq"
node src/api.js      # producer (port 4001)
node src/worker.js   # consumer
```

---

# Self-quiz (active recall)

Cover the answer, say it out loud, then check. Repeat until all are instant.

**Redis**

<details><summary>1. Why is Redis so fast?</summary>
Data lives in RAM and commands run in a single thread (no locks, atomic operations).
</details>

<details><summary>2. How do you store a value that expires in 30 seconds?</summary>
<code>redis.set(key, value, "EX", 30)</code> — one atomic command.
</details>

<details><summary>3. What do TTL values -1 and -2 mean?</summary>
-1 = key exists but has no expiry; -2 = key does not exist.
</details>

<details><summary>4. JSON string vs Hash for caching a user — which for partial updates and why?</summary>
Hash. You can update one field with <code>HSET key field value</code> without rewriting the whole object.
</details>

<details><summary>5. Which two list commands make a FIFO queue?</summary>
<code>LPUSH</code> to enqueue on the left, <code>RPOP</code> to dequeue on the right.
</details>

<details><summary>6. Write the fixed-window rate limiter logic in words.</summary>
On each request <code>INCR</code> a key per IP; if the count is 1, <code>EXPIRE</code> it (once); if count > limit, return 429; else continue.
</details>

<details><summary>7. Why set EXPIRE only on the first request?</summary>
Resetting the expiry on every request would extend the window forever, so a user could stay blocked indefinitely.
</details>

**BullMQ**

<details><summary>8. What are the three pieces of a BullMQ setup?</summary>
Queue (producer adds jobs), Worker (consumer processes jobs), and a shared Redis connection + identical queue name.
</details>

<details><summary>9. What happens when a worker handler throws?</summary>
The job is marked failed and retried per <code>attempts</code> and <code>backoff</code>; afterwards it stays failed.
</details>

<details><summary>10. What do attempts + exponential backoff with delay 1000 do?</summary>
Retry the job up to N times, waiting ~1s, 2s, 4s… between attempts.
</details>

<details><summary>11. Why use BullMQ instead of a raw Redis list?</summary>
It adds retries, backoff, delayed/scheduled jobs, priorities, progress, stalled-job recovery, and monitoring.
</details>

<details><summary>12. Jobs are piling up in "waiting" — what's the most likely cause?</summary>
The worker process isn't running, or its queue name / Redis connection doesn't match the producer's.
</details>

**One-line summaries to memorize**

- Redis = in-memory key-value store; fast, atomic, TTL-friendly.
- Cache-aside = check cache → miss → read DB → fill cache.
- BullMQ = production job queue on Redis with retries + backoff.
