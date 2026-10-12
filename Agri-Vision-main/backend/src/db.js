import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI;
const isDevMode = process.env.DEV_MODE === "true";

if (!uri && !isDevMode) {
  throw new Error("MONGODB_URI is not configured");
}

const client = uri
  ? new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    })
  : null;

let clientPromise;

export async function getDb() {
  if (!client) {
    throw new Error("MongoDB is not configured");
  }

  if (!clientPromise) {
    clientPromise = client.connect();
  }

  const connectedClient = await clientPromise;
  return connectedClient.db(process.env.MONGODB_DB_NAME || "agrivision");
}

export function hasDatabase() {
  return Boolean(client);
}
