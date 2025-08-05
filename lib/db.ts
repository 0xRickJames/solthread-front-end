import { MongoClient } from "mongodb";

const client = new MongoClient(process.env.MONGODB_URI as string);
export const db = client.db("solanaVerify");
export const verifications = db.collection("verifications");
