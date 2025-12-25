const fs = require("fs");
const path = require("path");
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const isCloudflare = !!process.env.CF_PAGES;
const PUBLIC_URL = "https://r2.pbsv.photo";

console.log(`🔍 Loading galleries data (Cloudflare: ${isCloudflare})`);

function readGlobalMeta() {
    const metaPath = path.join("src/_data", "galleryMetadata.json");
    if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
    return { portfolio: [], events: [] };
}

// Query R2 bucket and generate metadata from objects
async function generateMetadataFromR2() {
    if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        console.error("✗ R2 credentials not available. Cannot fetch metadata.");
        return {};
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

    const metadata = {};
    let continuationToken = undefined;

    console.log("📥 Querying R2 bucket for images...");

    try {
        do {
            const response = await r2Client.send(
                new ListObjectsV2Command({
                    Bucket: "photos",
                    ContinuationToken: continuationToken,
                })
            );

            if (response.Contents) {
                for (const obj of response.Contents) {
                    const key = obj.Key;

                    // Skip metadata files and non-image files
                    if (key.startsWith(".") || !key.match(/\.(jpg|jpeg|png|webp)$/i)) {
                        continue;
                    }

                    // Skip preview files for now, we'll pair them later
                    if (key.includes("_preview")) {
                        continue;
                    }

                    // Get object metadata to extract dimensions
                    try {
                        const headResponse = await r2Client.send(
                            new HeadObjectCommand({
                                Bucket: "photos",
                                Key: key,
                            })
                        );

                        // Extract dimensions from metadata (if stored) or use defaults
                        const width = headResponse.Metadata?.width ? parseInt(headResponse.Metadata.width) : null;
                        const height = headResponse.Metadata?.height ? parseInt(headResponse.Metadata.height) : null;
                        const type = key.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "jpg";

                        // Build corresponding preview key
                        const previewKey = key.replace(/\.(jpg|jpeg|png)$/i, "_preview.webp");

                        metadata[key] = {
                            url: `${PUBLIC_URL}/${key}`,
                            width: width,
                            height: height,
                            type: type,
                            preview: {
                                url: `${PUBLIC_URL}/${previewKey}`,
                                width: null,  // Preview dimensions would need to be extracted too
                                height: null,
                                type: "webp"
                            }
                        };
                    } catch (err) {
                        console.warn(`⚠ Failed to get metadata for ${key}: ${err.message}`);
                    }
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log(`✓ Found ${Object.keys(metadata).length} images in R2`);
        return metadata;
    } catch (err) {
        console.error(`✗ Error querying R2: ${err.message}`);
        return {};
    }
}

async function readImageMetadata() {
    const metadataPath = path.join("src/_data", "imageMetadata.json");

    // If local file exists, use it
    if (fs.existsSync(metadataPath)) {
        return JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    }

    // If on Cloudflare, generate metadata from R2 bucket
    if (isCloudflare) {
        console.log("🔗 Running on Cloudflare Pages, scanning R2 bucket for images...");
        try {
            return await generateMetadataFromR2();
        } catch (err) {
            console.error(`✗ Failed to generate metadata from R2: ${err.message}`);
            return {};
        }
    }

    return {};
}

function getImageNumber(fileName) {
    // Match first number in the filename
    const match = fileName.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function extractFileName(relativePath) {
    return path.basename(relativePath);
}

async function getGalleries() {
    const meta = readGlobalMeta();
    const imageMetadata = await readImageMetadata();
    let galleries = [];

    // Helper function to get images for a gallery
    function getImagesForGallery(type, folder, isLocked = false) {
        const prefix = `${type}/${folder}/`;

        // Find all images matching this gallery
        const images = Object.entries(imageMetadata)
            .filter(([key]) => key.startsWith(prefix) && !key.includes("_preview"))
            .map(([key, data], index) => {
                if (isLocked) {
                    // For locked galleries, use placeholder URLs but keep dimensions
                    // Each image gets a unique ID for client-side replacement
                    return {
                        fileName: extractFileName(key),
                        id: `img-${folder}-${index}`,
                        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
                        width: data.width,
                        height: data.height,
                        type: data.type,
                        preview: {
                            url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
                            width: data.preview.width,
                            height: data.preview.height,
                            type: data.preview.type
                        }
                    };
                }
                return {
                    fileName: extractFileName(key),
                    ...data
                };
            })
            .sort((a, b) => getImageNumber(a.fileName) - getImageNumber(b.fileName));

        return images;
    }

    // Portfolio
    meta.portfolio
        .forEach(entry => {
            const images = getImagesForGallery("portfolio", entry.folder);

            // Get preview image
            let previewUrl = null;
            if (entry.preview) {
                const previewKey = `portfolio/${entry.folder}/${entry.preview}`;
                if (imageMetadata[previewKey]) {
                    previewUrl = imageMetadata[previewKey].url;
                }
            } else if (images.length > 0) {
                previewUrl = images[0].url;
            }

            galleries.push({
                type: "portfolio",
                path: `/${entry.folder}/`,
                images: images,
                title: entry.title,
                description: entry.description || "",
                preview: previewUrl
            });
        });

    // Events
    meta.events
        .forEach(entry => {
            const isLocked = !!entry.password;
            const images = getImagesForGallery("events", entry.folder, isLocked);

            // Get preview image - for locked galleries, use a placeholder
            let previewUrl = null;
            if (!isLocked) {
                if (entry.preview) {
                    const previewKey = `events/${entry.folder}/${entry.preview}`;
                    if (imageMetadata[previewKey]) {
                        previewUrl = imageMetadata[previewKey].url;
                    }
                } else if (images.length > 0) {
                    previewUrl = images[0].url;
                }
            }

            galleries.push({
                type: "events",
                path: `/${entry.folder}/`,
                images: images, // Include images with placeholder URLs for locked galleries
                title: entry.title,
                short_title: entry.short_title || entry.title,
                description: entry.description || "",
                location: entry.location || "",
                date: entry.date || null,
                preview: previewUrl,
                locked: isLocked,
                folder: entry.folder // Include folder for worker API call
            });
        });

    return galleries;
}

function groupEventsByMonth(galleries) {
    const events = galleries.filter(g => g.type === "events" && g.date);
    const grouped = {};

    events.forEach(event => {
        const date = new Date(event.date);

        // Format event.date as dd.mm.yyyy
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        event.formattedDate = `${day}.${month}.${year}`;

        // Group key as "MonthName yyyy"
        const monthName = date.toLocaleString("en-US", { month: "long" });
        const groupKey = `${monthName} ${year}`;

        if (!grouped[groupKey]) grouped[groupKey] = [];
        grouped[groupKey].push(event);
    });

    // Convert to array format sorted by actual date descending (for months)
    return Object.entries(grouped)
        .map(([month, items]) => {
            const date = new Date(items[0].date);
            return { month, items, sortKey: date };
        })
        .sort((a, b) => b.sortKey - a.sortKey)
        .map(({ month, items }) => {
            // Sort events within the month
            items.sort((a, b) => new Date(b.date) - new Date(a.date));

            return { month, items };
        });
}

module.exports = async () => {
    const galleries = await getGalleries();
    const eventsByMonth = groupEventsByMonth(galleries);

    return {
        galleries,
        eventsByMonth
    };
};
