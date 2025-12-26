const fs = require("fs");
const path = require("path");

// Configuration
const METADATA_FILE = path.join(__dirname, "..", "_data", "imageMetadata.json");
const OUTPUT_FILE = path.join(__dirname, "..", "_data", "workerGalleryImages.json");
const GALLERY_META_FILE = path.join(__dirname, "..", "_data", "galleryMetadata.json");
const GALLERY_PASSWORDS_FILE = path.join(__dirname, "..", "_data", "galleryPasswords.json");
const AUTH_FILE = path.join(__dirname, "..", "..", "functions", "api", "auth.js");

function loadGalleryMetadata() {
    if (fs.existsSync(GALLERY_META_FILE)) {
        return JSON.parse(fs.readFileSync(GALLERY_META_FILE, "utf-8"));
    }
    return { portfolio: [], events: [] };
}

function formatObjectAsMultiline(obj, indent = 2) {
    const indentStr = ' '.repeat(indent);
    const entries = Object.entries(obj);

    if (entries.length === 0) {
        return '{}';
    }

    const lines = entries.map(([key, value]) => {
        const jsonValue = JSON.stringify(value);
        return `${indentStr}${JSON.stringify(key)}: ${jsonValue}, // #ignore`;
    });

    return '{\n' + lines.join('\n') + '\n}';
}

function updateAuthJS(galleryPasswords, galleryImages) {
    if (!fs.existsSync(AUTH_FILE)) {
        console.error(`Error: auth.js not found at ${AUTH_FILE}`);
        return false;
    }

    let authContent = fs.readFileSync(AUTH_FILE, "utf-8");

    // Format the objects as multiline with #ignore comments
    const passwordsFormatted = formatObjectAsMultiline(galleryPasswords);
    const imagesFormatted = formatObjectAsMultiline(galleryImages);

    const newPasswordsBlock = `const GALLERY_PASSWORDS = ${passwordsFormatted};`;
    const newImagesBlock = `const GALLERY_IMAGES = ${imagesFormatted};`;

    // Replace the GALLERY_PASSWORDS block (multiline)
    authContent = authContent.replace(
        /const GALLERY_PASSWORDS = \{[\s\S]*?\};/,
        newPasswordsBlock
    );

    // Replace the GALLERY_IMAGES block (multiline)
    authContent = authContent.replace(
        /const GALLERY_IMAGES = \{[\s\S]*?\};/,
        newImagesBlock
    );

    fs.writeFileSync(AUTH_FILE, authContent);
    return true;
}

function loadGalleryPasswords() {
    if (fs.existsSync(GALLERY_PASSWORDS_FILE)) {
        const passwords = JSON.parse(fs.readFileSync(GALLERY_PASSWORDS_FILE, "utf-8"));
        // Convert array to object mapping folder -> password
        const passwordMap = {};
        for (const entry of passwords) {
            passwordMap[entry.folder] = entry.password;
        }
        return passwordMap;
    }
    return {};
}

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

function generate() {
    const imageMetadata = JSON.parse(fs.readFileSync(METADATA_FILE, "utf-8"));
    const galleryMeta = loadGalleryMetadata();
    const galleryPasswords = loadGalleryPasswords();

    const galleries = {};

    for (const [key, data] of Object.entries(imageMetadata)) {
        // Skip preview images and only include protected galleries
        if (key.includes('_preview')) continue;
        if (!isProtectedGallery(key, galleryMeta)) continue;

        const parts = key.split('/');
        if (parts.length < 3) continue;

        const folder = parts[1];

        if (!galleries[folder]) {
            galleries[folder] = [];
        }

        // Store key for sorting, but we will discard it later
        galleries[folder].push({
            key,
            url: data.url,
            preview: data.preview.url
        });
    }

    // Sort each gallery by the numeric part of the filename to match Liquid order
    for (const folder in galleries) {
        galleries[folder].sort((a, b) => {
            const aNum = parseInt(a.key.match(/\/(\d+)\./)?.[1] || '0');
            const bNum = parseInt(b.key.match(/\/(\d+)\./)?.[1] || '0');
            return aNum - bNum;
        });

        // Final transformation: array of objects with url and preview
        galleries[folder] = galleries[folder].map(item => ({
            url: item.url,
            preview: item.preview
        }));
    }

    // Save the grouped data and update auth.js
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(galleries, null, 2));

    if (updateAuthJS(galleryPasswords, galleries)) {
        console.log("✓ Updated auth.js with optimized URL arrays");
    }
}

generate();