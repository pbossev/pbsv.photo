const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const os = require("os");

const basePaths = [
    { path: path.join(__dirname, "..", "content", "events"), mode: "events" },
    { path: path.join(__dirname, "..", "content", "portfolio"), mode: "portfolio" }
];

const previewSuffix = "_preview";

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
        .filter((file) => /\.(jpe?g|png|webp)$/i.test(file))
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

    const workers = Array.from({ length: Math.max(2, Math.floor(os.cpus().length / 2)) }, worker);
    await Promise.all(workers);

    return jobs.length;
}

async function main() {
    let totalGenerated = 0;

    for (let { path: galleriesPath, mode } of basePaths) {
        console.log(`\nProcessing ${mode} galleries in ${galleriesPath}...`);

        // Basic check to ensure path exists to prevent crash
        if (!fs.existsSync(galleriesPath)) {
            console.log(`Skipping ${galleriesPath} (not found)`);
            continue;
        }

        const galleries = fs.readdirSync(galleriesPath);
        for (let gallery of galleries) {
            const galleryDir = path.join(galleriesPath, gallery);
            if (fs.lstatSync(galleryDir).isDirectory()) {
                console.log(`Processing gallery: ${gallery} (${mode})`);
                const count = await processGallery(galleryDir, mode);
                totalGenerated += count;
            }
        }
    }

    console.log("\n========================================");
    console.log(`Finished! Total new previews generated: ${totalGenerated}`);
    console.log("========================================");
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});