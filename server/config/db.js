import mongoose from "mongoose";

function isLocalUri(uri) {
  return /127\.0\.0\.1|localhost/.test(uri || "");
}

async function connectInMemory() {
  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const memory = await MongoMemoryServer.create();
  const uri = memory.getUri("swasthyasetu");
  const conn = await mongoose.connect(uri);
  console.log(`MongoDB (in-memory) Connected: ${conn.connection.host}`);
  console.log(
    "Local MongoDB was not running. Data will reset when this process stops.",
  );
}

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  try {
    const conn = await mongoose.connect(uri);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return;
  } catch (error) {
    const canFallback =
      process.env.NODE_ENV !== "production" &&
      isLocalUri(uri) &&
      /ECONNREFUSED/.test(error.message);

    if (canFallback) {
      console.warn(
        "Local MongoDB refused the connection. Starting an in-memory database for development.",
      );
      try {
        await connectInMemory();
        return;
      } catch (memoryError) {
        console.error(`In-memory MongoDB failed: ${memoryError.message}`);
      }
    }

    console.error(`MongoDB Connection Error: ${error.message}`);
    process.exit(1);
  }
};

// Handle connection events
mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

mongoose.connection.on("error", (err) => {
  console.error(`MongoDB error: ${err.message}`);
});

export default connectDB;
