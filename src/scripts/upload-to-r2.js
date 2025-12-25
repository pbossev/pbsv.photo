const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sharp = require("sharp");
const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");
const { imageSize } = require("image-size");
const os = require("os");
require("dotenv").config();

// Configuration
const BUCKET_NAME = "photos";
const PUBLIC_URL = "https://r2.pbsv.photo";
const CONTENT_DIR = path.join(__dirname, "..", "content");
const STATE_FILE = path.join(__dirname, "..", "_data", "uploadState.json");
const METADATA_FILE = path.join(__dirname, "..", "_data", "imageMetadata.json");
const GALLERY_META_FILE = path.join(__dirname, "..", "_data", "galleryMetadata.json");
const CONCURRENCY = Math.max(4, os.cpus().length); // Parallel uploads

// R2 Client
console.log("Initializing R2 client...");
const r2Client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    forcePathStyle: true,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

// Helper: Get file hash based on size + mtime
function getFileHash(filePath) {
    const stats = fs.statSync(filePath);
    const hash = crypto.createHash("md5");
    hash.update(`${stats.size}-${stats.mtimeMs}`);
    return hash.digest("hex");
}

// Helper: Generate preview
async function generatePreview(fullPath, mode) {
    const previewBuffer = await sharp(fullPath)
        .resize(
            mode === "events"
                ? { height: 400, fit: "inside", withoutEnlargement: true }
                : { width: 800, fit: "inside", withoutEnlargement: true }
        )
        .webp({ quality: 80, effort: 6, lossless: false, smartSubsample: true })
        .toBuffer();

    return previewBuffer;
}

// Helper: Get image dimensions
function getImageDimensions(buffer) {
    const { width, height, type } = imageSize(buffer);
    return { width, height, type };
}

// Stats tracking
const stats = {
    bytesUploaded: 0,
    bytesDeleted: 0,
    operations: {
        PutObject: 0,
        DeleteObject: 0,
        ListObjects: 0,
    }
};

// Helper: Upload to R2
async function uploadToR2(key, buffer, contentType) {
    await r2Client.send(
        new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType,
        })
    );
    stats.bytesUploaded += buffer.length;
    stats.operations.PutObject++;
}

// Helper: Delete from R2
async function deleteFromR2(key) {
    await r2Client.send(
        new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        })
    );
    stats.operations.DeleteObject++;
}

// Helper: List all R2 objects
async function listR2Objects() {
    const objects = [];
    let continuationToken = undefined;

    do {
        console.log("  ⏳ Fetching R2 object list...");
        const response = await r2Client.send(
            new ListObjectsV2Command({
                Bucket: BUCKET_NAME,
                ContinuationToken: continuationToken,
            })
        );
        stats.operations.ListObjects++;

        if (response.Contents) {
            objects.push(...response.Contents.map(obj => obj.Key));
        }

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    return objects;
}

// Format bytes for display
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Load previous state
function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    }
    return {};
}

// Save state
function saveState(state) {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// Load metadata
function loadMetadata() {
    if (fs.existsSync(METADATA_FILE)) {
        return JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));
    }
    return {};
}

// Save metadata
function saveMetadata(metadata) {
    const dir = path.dirname(METADATA_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
}

// Load gallery metadata to check which galleries are password-protected
function loadGalleryMetadata() {
    if (fs.existsSync(GALLERY_META_FILE)) {
        return JSON.parse(fs.readFileSync(GALLERY_META_FILE, "utf-8"));
    }
    return { portfolio: [], events: [] };
}

// Check if a path belongs to a password-protected gallery
function isProtectedGallery(relativePath, galleryMeta) {
    // Extract folder from path like "events/folder_name/image.jpg"
    const parts = relativePath.split('/');
    if (parts.length < 2) return false;

    const type = parts[0]; // "events" or "portfolio"
    const folder = parts[1];

    if (type === 'events') {
        const gallery = galleryMeta.events.find(e => e.folder === folder);
        return gallery && gallery.password === true;
    } else if (type === 'portfolio') {
        const gallery = galleryMeta.portfolio.find(p => p.folder === folder);
        return gallery && gallery.password === true;
    }

    return false;
}

// Get content type from extension
function getContentType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    };
    return types[ext] || "application/octet-stream";
}

// Scan local files
function scanLocalFiles() {
    const files = [];

    // Scan portfolio and events galleries
    const types = ["portfolio", "events"];
    for (const type of types) {
        const typeDir = path.join(CONTENT_DIR, type);
        if (!fs.existsSync(typeDir)) continue;

        const galleries = fs.readdirSync(typeDir);
        for (const gallery of galleries) {
            const galleryDir = path.join(typeDir, gallery);
            if (!fs.lstatSync(galleryDir).isDirectory()) continue;

            const images = fs.readdirSync(galleryDir).filter(file => /\.(jpg|jpeg|png)$/i.test(file));

            for (const image of images) {
                const fullPath = path.join(galleryDir, image);
                const relativePath = path.relative(CONTENT_DIR, fullPath).replace(/\\/g, "/");
                files.push({ fullPath, relativePath, type, standalone: false });
            }
        }
    }

    // Scan standalone images directory
    const imagesDir = path.join(CONTENT_DIR, "images");
    if (fs.existsSync(imagesDir)) {
        const images = fs.readdirSync(imagesDir).filter(file => /\.(jpg|jpeg|png)$/i.test(file));

        for (const image of images) {
            const fullPath = path.join(imagesDir, image);
            const relativePath = path.relative(CONTENT_DIR, fullPath).replace(/\\/g, "/");
            files.push({ fullPath, relativePath, type: "standalone", standalone: true });
        }
    }

    return files;
}

// Process single file upload
async function processUpload(fileInfo, allMetadata, galleryMeta) {
    const { fullPath, relativePath, type, isNew, standalone } = fileInfo;

    // Read original file
    const originalBuffer = fs.readFileSync(fullPath);
    const originalDimensions = getImageDimensions(originalBuffer);

    // Upload original
    const originalKey = relativePath;
    await uploadToR2(originalKey, originalBuffer, getContentType(fullPath));
    console.log(`  ↑ Uploaded: ${originalKey} (${formatBytes(originalBuffer.length)})`);

    // Generate and upload preview (for standalone images, use portfolio sizing)
    const previewType = standalone ? "portfolio" : type;
    const previewBuffer = await generatePreview(fullPath, previewType);
    const previewDimensions = getImageDimensions(previewBuffer);
    const previewKey = relativePath.replace(/\.(jpg|jpeg|png)$/i, "_preview.webp");
    await uploadToR2(previewKey, previewBuffer, "image/webp");
    console.log(`  ↑ Uploaded: ${previewKey} (${formatBytes(previewBuffer.length)})`);

    // Create metadata object
    const metadataObj = {
        url: `${PUBLIC_URL}/${originalKey}`,
        width: originalDimensions.width,
        height: originalDimensions.height,
        type: originalDimensions.type,
        preview: {
            url: `${PUBLIC_URL}/${previewKey}`,
            width: previewDimensions.width,
            height: previewDimensions.height,
            type: previewDimensions.type,
        },
    };

    // Determine if this belongs to a password-protected gallery
    const isProtected = isProtectedGallery(relativePath, galleryMeta);

    // Store all images in single metadata file
    allMetadata[relativePath] = metadataObj;

    if (isProtected) {
        console.log(`  🔒 Protected gallery image`);
    }

    return { relativePath, isNew, isProtected };
}

// Parallel processing with concurrency limit
async function processInParallel(items, processor, concurrency) {
    const results = [];
    let index = 0;

    async function worker() {
        while (index < items.length) {
            const item = items[index++];
            const result = await processor(item);
            results.push(result);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
    await Promise.all(workers);

    return results;
}

async function main() {
    console.log("Starting R2 sync...\n");

    const state = loadState();
    const allMetadata = loadMetadata();
    const galleryMeta = loadGalleryMetadata();
    const localFiles = scanLocalFiles();

    // Track changes
    const toUpload = [];
    const newState = {};
    const newMetadata = {};

    // Check for new/changed files
    for (const { fullPath, relativePath, type, standalone } of localFiles) {
        const currentHash = getFileHash(fullPath);
        const previousHash = state[relativePath];

        newState[relativePath] = currentHash;

        if (currentHash !== previousHash) {
            toUpload.push({ fullPath, relativePath, type, standalone, isNew: !previousHash });
        } else {
            // File unchanged, copy existing metadata
            if (allMetadata[relativePath]) {
                newMetadata[relativePath] = allMetadata[relativePath];
            }
        }
    }

    // Process uploads in parallel
    if (toUpload.length > 0) {
        console.log(`Uploading ${toUpload.length} changed files with ${CONCURRENCY} parallel workers...\n`);

        await processInParallel(
            toUpload,
            (fileInfo) => processUpload(fileInfo, newMetadata, galleryMeta),
            CONCURRENCY
        );

        console.log("");
    }

    // Find files to delete from R2
    const localKeysWithPreviews = new Set([
        ...localFiles.map(f => f.relativePath),
        ...localFiles.map(f => f.relativePath.replace(/\.(jpg|jpeg|png)$/i, "_preview.webp"))
    ]);

    console.log("\nFetching R2 object list...");
    const r2Objects = await listR2Objects();
    const toDelete = r2Objects.filter(key => !localKeysWithPreviews.has(key));

    // Delete orphaned files in parallel
    if (toDelete.length > 0) {
        console.log(`\nDeleting ${toDelete.length} orphaned files...`);

        await processInParallel(
            toDelete,
            async (key) => {
                await deleteFromR2(key);
                console.log(`✓ Deleted: ${key}`);
            },
            CONCURRENCY
        );
    }

    // Save state and metadata
    saveState(newState);
    saveMetadata(newMetadata);

    const totalCount = Object.keys(newMetadata).length;
    const protectedCount = Object.keys(newMetadata).filter(key =>
        isProtectedGallery(key, galleryMeta)
    ).length;
    const publicCount = totalCount - protectedCount;

    console.log("\n========================================");
    console.log(`Sync complete!`);
    console.log(`  Uploaded: ${toUpload.length} files (${toUpload.length * 2} including previews)`);
    console.log(`  Deleted: ${toDelete.length} files`);
    console.log(`  Total images: ${localFiles.length}`);
    console.log(`  Public images: ${publicCount}`);
    console.log(`  Protected images: ${protectedCount}`);
    console.log(`  Concurrency: ${CONCURRENCY} workers`);
    console.log("\nData Transfer:");
    console.log(`  Uploaded: ${formatBytes(stats.bytesUploaded)}`);
    console.log("\nR2 Operations:");
    console.log(`  PutObject: ${stats.operations.PutObject}`);
    console.log(`  DeleteObject: ${stats.operations.DeleteObject}`);
    console.log(`  ListObjects: ${stats.operations.ListObjects}`);
    console.log(`  Total: ${stats.operations.PutObject + stats.operations.DeleteObject + stats.operations.ListObjects}`);
    console.log("========================================");
}

main().catch(err => {
    console.error("Error:", err);
    process.exit(1);
});
