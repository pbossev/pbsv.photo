const fs = require("fs");
const path = require("path");

function readGlobalMeta() {
    const metaPath = path.join("src/_data", "galleryMetadata.json");
    if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    }
    return { portfolio: [], events: [] };
}

function readImageMetadata() {
    const metadataPath = path.join("src/_data", "imageMetadata.json");
    if (fs.existsSync(metadataPath)) {
        return JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
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

function getGalleries() {
    const meta = readGlobalMeta();
    const imageMetadata = readImageMetadata();
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

const galleries = getGalleries();
const eventsByMonth = groupEventsByMonth(galleries);

module.exports = {
    galleries,
    eventsByMonth
};
