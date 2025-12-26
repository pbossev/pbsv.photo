const fs = require("fs");
const path = require("path");
const { S3Client, ListObjectsV2Command } = require("@aws-sdk/client-s3");
require("dotenv").config();

const BUCKET_NAME = "photos";

// Helper: Extract dimensions from embedded key format
// Keys are in format: "path/to/image__w1920h1080.jpg"
function extractDimensionsFromKey(key) {
    const match = key.match(/__w(\d+)h(\d+)\./);
    if (match) {
        return {
            width: parseInt(match[1], 10),
            height: parseInt(match[2], 10)
        };
    }
    return null;
}

// Format bytes for display
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function main() {
    // Validate credentials
    if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        console.error("❌ Missing R2 credentials. Please ensure R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY are set in .env");
        process.exit(1);
    }

    const r2Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT,
        forcePathStyle: true,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });

    const originals = [];
    const previews = [];
    let continuationToken = undefined;
    let totalSize = 0;

    console.log(`📦 Listing objects in R2 bucket: ${BUCKET_NAME}\n`);

    try {
        do {
            const response = await r2Client.send(
                new ListObjectsV2Command({
                    Bucket: BUCKET_NAME,
                    ContinuationToken: continuationToken,
                })
            );

            if (response.Contents) {
                for (const obj of response.Contents) {
                    const key = obj.Key;
                    const size = obj.Size || 0;
                    totalSize += size;

                    // Skip metadata files
                    if (key.startsWith(".")) continue;

                    // Skip non-image files
                    if (!key.match(/\.(jpg|jpeg|png|webp)$/i)) continue;

                    const isPreview = key.includes("_preview");
                    const dimensions = extractDimensionsFromKey(key);
                    const dimString = dimensions ? `${dimensions.width}x${dimensions.height}` : "unknown";

                    const entry = {
                        key,
                        size,
                        sizeFormatted: formatBytes(size),
                        isPreview,
                        dimensions
                    };

                    if (isPreview) {
                        previews.push(entry);
                    } else {
                        originals.push(entry);
                    }
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        // Sort originals by path
        originals.sort((a, b) => a.key.localeCompare(b.key));
        previews.sort((a, b) => a.key.localeCompare(b.key));

        // Display results
        console.log(`📸 Original Images: ${originals.length}`);
        console.log("─".repeat(100));
        for (const img of originals) {
            const dimString = img.dimensions ? `${img.dimensions.width}x${img.dimensions.height}` : "unknown";
            console.log(`  ${img.key.padEnd(60)} ${dimString.padStart(15)} ${img.sizeFormatted.padStart(12)}`);
        }

        console.log(`\n🖼️  Preview Images: ${previews.length}`);
        console.log("─".repeat(100));
        for (const prev of previews) {
            const dimString = prev.dimensions ? `${prev.dimensions.width}x${prev.dimensions.height}` : "unknown";
            console.log(`  ${prev.key.padEnd(60)} ${dimString.padStart(15)} ${prev.sizeFormatted.padStart(12)}`);
        }

        // Summary
        console.log(`\n📊 Summary`);
        console.log("─".repeat(100));
        console.log(`  Total Objects: ${originals.length + previews.length}`);
        console.log(`  Original Images: ${originals.length}`);
        console.log(`  Preview Images: ${previews.length}`);
        console.log(`  Total Size: ${formatBytes(totalSize)}`);

        // Check for missing previews
        const imagesWithoutPreviews = originals.filter(img => {
            const basePath = img.key.replace(/__w\d+h\d+/, "");
            return !previews.some(prev => prev.key.includes(basePath));
        });

        if (imagesWithoutPreviews.length > 0) {
            console.log(`\n⚠️  Images without previews: ${imagesWithoutPreviews.length}`);
            for (const img of imagesWithoutPreviews.slice(0, 10)) {
                console.log(`     ${img.key}`);
            }
            if (imagesWithoutPreviews.length > 10) {
                console.log(`     ... and ${imagesWithoutPreviews.length - 10} more`);
            }
        } else {
            console.log(`\n✅ All original images have previews`);
        }

    } catch (err) {
        console.error(`❌ Error listing R2 bucket: ${err.message}`);
        process.exit(1);
    }
}

main();
