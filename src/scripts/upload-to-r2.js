const { S3Client, ListObjectsV2Command, PutObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");

// 1. Only load dotenv if we are NOT in the Cloudflare build environment
if (!process.env.CF_PAGES) {
    require("dotenv").config();
}

// 2. Debug Check (Prints to your Cloudflare Build logs)
console.log("--- R2 Configuration Check ---");
console.log("Endpoint exists:", !!process.env.ENDPOINT);
console.log("Access Key exists:", !!process.env.ACCESS_KEY_ID);
console.log("Secret Key exists:", !!process.env.SECRET_ACCESS_KEY);
console.log("------------------------------");

// 3. Initialize the S3 Client
// Note: R2 requires the region to be set to "auto"
const s3Client = new S3Client({
    region: "auto",
    endpoint: process.env.ENDPOINT,
    credentials: {
        accessKeyId: process.env.ACCESS_KEY_ID,
        secretAccessKey: process.env.SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = "pbsv-photo-bucket"; // Replace with your actual bucket name or process.env.BUCKET

async function uploadFiles() {
    try {
        console.log("Testing connection by fetching object list...");

        // This is likely where your script was failing with a 403
        const listCommand = new ListObjectsV2Command({ Bucket: BUCKET_NAME });
        await s3Client.send(listCommand);

        console.log("Successfully connected to R2!");

        // Add your file upload logic here (e.g., reading from _site folder)
        // ...

    } catch (err) {
        console.error("Critical R2 Error:", err.message);
        if (err.message.includes("403")) {
            console.error("Check: Ensure your R2 API Token has 'Edit' permissions and the Endpoint is correct.");
        }
        process.exit(1);
    }
}

uploadFiles();