const fs = require("fs");
const path = require("path");
const sharp = require("sharp"); // npm install sharp
const os = require("os");

const basePaths = [
    { path: path.join(__dirname, "..", "content", "events"), mode: "events" },
    { path: path.join(__dirname, "..", "content", "portfolio"), mode: "portfolio" }
];

const previewSuffix = "_preview";

// Use half of available CPUs to avoid overload
const CONCURRENCY = Math.max(2, Math.floor(os.cpus().length / 2));

function isImage(file) {
    return /\.(jpe?g|png|webp)$/i.test(file);
}

async function generatePreview(fullPath, previewPath, mode) {
    console.log(`Generating preview for ${path.basename(fullPath)} (${mode})...`);

    let resizeOptions;
    if (mode === "events") {
        resizeOptions = { height: 400, fit: "inside", withoutEnlargement: true };
    } else if (mode === "portfolio") {
        resizeOptions = { width: 800, fit: "inside", withoutEnlargement: true };
    }

    await sharp(fullPath)
        .resize(resizeOptions)
        .webp({
            quality: 80,
            effort: 6,
            lossless: false,
            smartSubsample: true
        })
        .toFile(previewPath);
}

async function processGallery(folder, mode) {
    const files = fs.readdirSync(folder);

    const jobs = files
        .filter(isImage)
        .map(file => {
            const origExt = path.extname(file);
            const base = path.basename(file, origExt);

            if (base.endsWith(previewSuffix)) return null;

            const fullPath = path.join(folder, file);
            const previewFile = `${base}${previewSuffix}.webp`;
            const previewPath = path.join(folder, previewFile);

            if (fs.existsSync(previewPath)) return null;

            return () => generatePreview(fullPath, previewPath, mode);
        })
        .filter(Boolean);

    let index = 0;
    async function worker() {
        while (index < jobs.length) {
            const job = jobs[index++];
            await job();
        }
    }

    const workers = Array.from({ length: CONCURRENCY }, worker);
    await Promise.all(workers);
}

async function main() {
    for (let { path: galleriesPath, mode } of basePaths) {
        console.log(`\nProcessing ${mode} galleries in ${galleriesPath}...`);
        const galleries = fs.readdirSync(galleriesPath);
        for (let gallery of galleries) {
            const galleryDir = path.join(galleriesPath, gallery);
            if (fs.lstatSync(galleryDir).isDirectory()) {
                console.log(`Processing gallery: ${gallery} (${mode})`);
                await processGallery(galleryDir, mode);
            }
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
