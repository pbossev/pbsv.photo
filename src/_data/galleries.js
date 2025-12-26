const fs = require("fs");
const path = require("path");
const { S3Client, ListObjectsV2Command, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { imageSize } = require("image-size");
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

// Helper: Extract original path from key with embedded dimensions
// Converts "portfolio/astro/1__w3285h4928.jpg" back to "portfolio/astro/1.jpg"
function extractOriginalPathFromKey(key) {
    return key.replace(/__w\d+h\d+/, "");
}

// Helper: Extract base path for matching (without dimensions and without _preview)
// Used to associate preview files with their original images
// "portfolio/astro/1__w3285h4928.jpg" → "portfolio/astro/1.jpg"
// "portfolio/astro/1__w800h1200_preview.webp" → "portfolio/astro/1_preview.webp"
function extractBasePath(key) {
    return key.replace(/__w\d+h\d+/, "");
}

// Generate metadata from local filesystem
async function generateMetadataFromLocalFiles() {
    const metadata = {};
    const CONTENT_DIR = path.join(__dirname, "..", "content");

    console.log("📁 Reading images from local filesystem...");

    const types = ["portfolio", "events"];

    for (const type of types) {
        const typeDir = path.join(CONTENT_DIR, type);
        if (!fs.existsSync(typeDir)) continue;

        const galleries = fs.readdirSync(typeDir);

        for (const gallery of galleries) {
            const galleryDir = path.join(typeDir, gallery);
            if (!fs.lstatSync(galleryDir).isDirectory()) continue;

            const files = fs.readdirSync(galleryDir);

            // Filter images (exclude previews)
            const images = files.filter(f =>
                /\.(jpg|jpeg|png)$/i.test(f) && !f.includes("_preview")
            );

            for (const image of images) {
                const imagePath = path.join(galleryDir, image);
                const relativePath = path.relative(CONTENT_DIR, imagePath).replace(/\\/g, "/");

                try {
                    // Get dimensions from actual file
                    const imageBuffer = fs.readFileSync(imagePath);
                    const dimensions = imageSize(imageBuffer);

                    // Check for preview file
                    const ext = path.extname(image);
                    const baseName = image.slice(0, -ext.length);
                    const previewName = `${baseName}_preview.webp`;
                    const previewPath = path.join(galleryDir, previewName);

                    let previewInfo = {
                        url: null,
                        width: null,
                        height: null,
                        type: "webp"
                    };

                    if (fs.existsSync(previewPath)) {
                        try {
                            const previewBuffer = fs.readFileSync(previewPath);
                            const previewDimensions = imageSize(previewBuffer);
                            previewInfo = {
                                url: `/content/${relativePath.replace(ext, "_preview.webp")}`,
                                width: previewDimensions.width,
                                height: previewDimensions.height,
                                type: "webp"
                            };
                        } catch (err) {
                            console.warn(`⚠ Failed to read preview dimensions for ${previewName}: ${err.message}`);
                        }
                    }

                    metadata[relativePath] = {
                        url: `/content/${relativePath}`,
                        width: dimensions.width,
                        height: dimensions.height,
                        type: dimensions.type,
                        preview: previewInfo
                    };
                } catch (err) {
                    console.warn(`⚠ Failed to read dimensions for ${relativePath}: ${err.message}`);
                }
            }
        }
    }

    console.log(`✓ Found ${Object.keys(metadata).length} images in local filesystem`);
    return metadata;
}

// Query R2 bucket and generate metadata from objects
async function generateMetadataFromR2() {
    // Validate credentials
    if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
        const missing = [];
        if (!process.env.R2_ENDPOINT) missing.push("R2_ENDPOINT");
        if (!process.env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
        if (!process.env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");

        throw new Error(`Missing required R2 credentials: ${missing.join(", ")}. ` +
            `Please set these as environment variables in Cloudflare Pages settings.`);
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

    const originals = {};
    const previews = {};
    let continuationToken = undefined;
    let totalObjects = 0;
    let skippedObjects = 0;

    console.log("📥 Querying R2 bucket for images...");

    try {
        // PASS 1: Collect all objects
        do {
            const response = await r2Client.send(
                new ListObjectsV2Command({
                    Bucket: "photos",
                    ContinuationToken: continuationToken,
                })
            );

            if (response.Contents) {
                totalObjects += response.Contents.length;

                for (const obj of response.Contents) {
                    const key = obj.Key;

                    // Skip metadata files and non-image files
                    if (key.startsWith(".") || !key.match(/\.(jpg|jpeg|png|webp)$/i)) {
                        skippedObjects++;
                        continue;
                    }

                    // Extract dimensions from embedded key
                    const dimensions = extractDimensionsFromKey(key);
                    if (!dimensions) {
                        console.warn(`⚠ Could not extract dimensions from key: ${key}`);
                        skippedObjects++;
                        continue;
                    }

                    const basePath = extractBasePath(key);
                    const type = key.match(/\.(\w+)$/i)?.[1]?.toLowerCase() || "jpg";

                    // Separate previews from originals
                    if (key.includes("_preview")) {
                        previews[basePath] = {
                            key: key,
                            width: dimensions.width,
                            height: dimensions.height,
                            type: type
                        };
                    } else {
                        const originalPath = extractOriginalPathFromKey(key);
                        originals[originalPath] = {
                            key: key,
                            basePath: basePath,
                            width: dimensions.width,
                            height: dimensions.height,
                            type: type
                        };
                    }
                }
            }

            continuationToken = response.NextContinuationToken;
        } while (continuationToken);

        console.log(`✓ R2 Scan Complete:`);
        console.log(`  Total objects: ${totalObjects}`);
        console.log(`  Skipped: ${skippedObjects}`);
        console.log(`  Original images: ${Object.keys(originals).length}`);
        console.log(`  Preview images: ${Object.keys(previews).length}`);

        // PASS 2: Match previews to originals and build final metadata
        const metadata = {};
        let matchedPreviews = 0;

        for (const [originalPath, originalData] of Object.entries(originals)) {
            const previewData = previews[originalData.basePath];

            if (previewData) {
                matchedPreviews++;
            }

            metadata[originalPath] = {
                url: `${PUBLIC_URL}/${originalData.key}`,
                width: originalData.width,
                height: originalData.height,
                type: originalData.type,
                preview: previewData ? {
                    url: `${PUBLIC_URL}/${previewData.key}`,
                    width: previewData.width,
                    height: previewData.height,
                    type: previewData.type
                } : {
                    url: null,
                    width: null,
                    height: null,
                    type: "webp"
                }
            };
        }

        console.log(`✓ Preview matching: ${matchedPreviews}/${Object.keys(originals).length} images have previews`);

        if (Object.keys(originals).length > 0 && matchedPreviews < Object.keys(originals).length * 0.8) {
            console.warn(`⚠ Warning: Less than 80% of images have preview matches. ` +
                `This may indicate an issue with preview generation or upload.`);
        }

        return metadata;
    } catch (err) {
        console.error(`✗ Error querying R2: ${err.message}`);
        console.error(`  Endpoint: ${process.env.R2_ENDPOINT}`);
        console.error(`  Bucket: photos`);
        throw err;
    }
}

async function readImageMetadata() {
    const metadataPath = path.join("src/_data", "imageMetadata.json");

    // Priority 1: If local metadata file exists, use it (fastest)
    if (fs.existsSync(metadataPath)) {
        console.log("📄 Using cached imageMetadata.json");
        return JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    }

    // Priority 2: If on Cloudflare, generate metadata from R2 bucket
    if (isCloudflare) {
        console.log("☁️ Running on Cloudflare Pages, generating metadata from R2...");
        try {
            const metadata = await generateMetadataFromR2();

            // Optionally save to disk (though it might not persist in CF Pages)
            try {
                const dir = path.dirname(metadataPath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
                console.log(`✓ Saved generated imageMetadata.json`);
            } catch (writeErr) {
                console.warn(`⚠ Could not save metadata file (expected on CF Pages): ${writeErr.message}`);
            }

            return metadata;
        } catch (err) {
            console.error(`✗ Failed to generate metadata from R2: ${err.message}`);
            throw err;
        }
    }

    // Priority 3: Local development - read from filesystem
    console.log("💻 Local development mode, reading from filesystem...");
    return await generateMetadataFromLocalFiles();
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
                    previewUrl = imageMetadata[previewKey].preview.url;
                }
            } else if (images.length > 0) {
                previewUrl = images[0].preview.url;
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
                        previewUrl = imageMetadata[previewKey].preview.url;
                    }
                } else if (images.length > 0) {
                    previewUrl = images[0].preview.url;
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
