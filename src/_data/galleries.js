
const fs = require("fs");
const path = require("path");
const { imageSize } = require("image-size");

function getImageFiles(folderPath) {
    return fs.readdirSync(folderPath).filter(file => /\.(jpg|jpeg|png)$/i.test(file));
}

function readGlobalMeta() {
    const metaPath = path.join("src/content", "meta.json");
    if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
    return { portfolio: [], events: [] };
}

function getImageMeta(filePath, publicPath) {
    const buffer = fs.readFileSync(filePath);
    const { width, height, type } = imageSize(buffer);

    // Try to also load _preview.webp
    const previewPath = filePath.replace(/\.(jpg|jpeg|png)$/i, "_preview.webp");
    let previewMeta = null;

    if (fs.existsSync(previewPath)) {
        try {
            const previewBuffer = fs.readFileSync(previewPath);
            const { width: pw, height: ph, type: pt } = imageSize(previewBuffer);
            previewMeta = {
                url: publicPath.replace(/\.(jpg|jpeg|png)$/i, "_preview.webp"),
                width: pw,
                height: ph,
                type: pt
            };
        } catch (err) {
            console.warn("Could not read preview image:", previewPath, err);
        }
    }

    return {
        url: publicPath,
        width,
        height,
        type,
        preview: previewMeta
    };
}


function getImageNumber(fileName) {
    // Match first number in the filename
    const match = fileName.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function getGalleries() {
    const baseDir = "src/content";
    const meta = readGlobalMeta();
    let galleries = [];

    // portfolio
    meta.portfolio
        .filter(entry => entry.visible !== false)
        .forEach(entry => {
            const folderPath = path.join(baseDir, "portfolio", entry.folder);
            if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
                let images = getImageFiles(folderPath);

                // Sort images numerically
                images.sort((a, b) => getImageNumber(a) - getImageNumber(b));

                galleries.push({
                    type: "portfolio",
                    path: `/${entry.folder}/`,
                    images: images.map(file =>
                        getImageMeta(
                            path.join(folderPath, file),
                            `/content/portfolio/${entry.folder}/${file}`
                        )
                    ),
                    title: entry.title,
                    description: entry.description || "",
                    preview: entry.preview
                        ? `/content/portfolio/${entry.folder}/${entry.preview}`
                        : (images.length > 0
                            ? `/content/portfolio/${entry.folder}/${images[0]}`
                            : null)
                });
            }
        });

    // events
    meta.events
        .filter(entry => entry.visible !== false)
        .forEach(entry => {
            const folderPath = path.join(baseDir, "events", entry.folder);
            if (fs.existsSync(folderPath) && fs.lstatSync(folderPath).isDirectory()) {
                let images = getImageFiles(folderPath);

                // Sort images numerically
                images.sort((a, b) => getImageNumber(a) - getImageNumber(b));

                galleries.push({
                    type: "events",
                    path: `/${entry.folder}/`,
                    images: images.map(file =>
                        getImageMeta(
                            path.join(folderPath, file),
                            `/content/events/${entry.folder}/${file}`
                        )
                    ),
                    title: entry.title,
                    short_title: entry.short_title || entry.title,
                    description: entry.description || "",
                    location: entry.location || "",
                    date: entry.date || null,
                    preview: entry.preview
                        ? `/content/events/${entry.folder}/${entry.preview}`
                        : (images.length > 0
                            ? `/content/events/${entry.folder}/${images[0]}`
                            : null)
                });
            }
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
            // ⭐ ADD THIS LINE TO SORT EVENTS WITHIN THE MONTH
            items.sort((a, b) => new Date(b.date) - new Date(a.date));

            return { month, items };
        });
}

const galleries = getGalleries();
console.log(galleries)
const eventsByMonth = groupEventsByMonth(galleries);

module.exports = {
    galleries,
    eventsByMonth
};
