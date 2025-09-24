const fs = require("fs");
const path = require("path");

const previewSuffix = "_preview";

// Paths to clear
const galleriesPaths = [
    path.join(__dirname, "..", "content", "events"),
    path.join(__dirname, "..", "content", "portfolio"),
];

function isPreview(file) {
    const ext = path.extname(file);
    const base = path.basename(file, ext);
    return base.endsWith(previewSuffix);
}

function clearPreviews(folder) {
    const files = fs.readdirSync(folder);

    for (let file of files) {
        const fullPath = path.join(folder, file);
        const stat = fs.lstatSync(fullPath);

        if (stat.isDirectory()) {
            clearPreviews(fullPath);
        } else if (isPreview(file)) {
            console.log(`Deleting preview: ${fullPath}`);
            fs.unlinkSync(fullPath);
        }
    }
}

function main() {
    for (let galleriesPath of galleriesPaths) {
        if (!fs.existsSync(galleriesPath)) {
            console.error("Path not found:", galleriesPath);
            continue;
        }
        clearPreviews(galleriesPath);
    }
    console.log("All previews cleared.");
}

main();
