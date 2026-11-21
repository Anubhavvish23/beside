const ttl_seconds = 6 * 60 * 60;

type MemoryStore = Map<string, string>;

const memory_holder = globalThis as typeof globalThis & {
  __beside_memory?: MemoryStore;
};

function memory(): MemoryStore {
  if (!memory_holder.__beside_memory) {
    memory_holder.__beside_memory = new Map();
  }
  return memory_holder.__beside_memory;
}

function redis_endpoint(): { url: string; token: string } | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function redis_command(command: unknown[]): Promise<unknown> {
  const endpoint = redis_endpoint();
  if (!endpoint) throw new Error("Redis is not configured.");
  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  const body = (await response.json()) as { result?: unknown; error?: string };
  if (!response.ok || body.error) {
    throw new Error(body.error || `store failed: ${response.status}`);
  }
  return body.result;
}

export function store_kind(): "redis" | "memory" {
  return redis_endpoint() ? "redis" : "memory";
}

export async function read_raw(key: string): Promise<string | null> {
  if (redis_endpoint()) {
    const result = await redis_command(["GET", key]);
    return typeof result === "string" ? result : null;
  }
  return memory().get(key) ?? null;
}

export async function write_raw(key: string, raw: string): Promise<void> {
  if (redis_endpoint()) {
    await redis_command(["SET", key, raw, "EX", ttl_seconds]);
    return;
  }
  memory().set(key, raw);
}
