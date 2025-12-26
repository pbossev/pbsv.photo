# pbsv.photo

My photography portfolio built with 11ty, Liquid and TailwindCSS.

## License

This project's code is under the
[MIT](https://choosealicense.com/licenses/mit/) license.

All the photos found on the [site](https://pbsv.photo) are available under [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## Features

- **Event Gallery**: Flickr-style layout displaying photography with .webp previews
- **Portfolio Gallery**: Masonry-style layout displaying photography with .webp previews
  <!-- - **Photo Map**: Mapbox map showing photo locations with markers -->
  <!-- - **Search**: Full-text search using Pagefind with image previews -->
  <!-- - **RSS Feed**: XML feed for photo updates -->
- **Responsive Design**: Mobile-first layout
- **Optimizations**: Optimized images, perfect Lighthouse score
- **Minimal JavaScript**: JavaScript only inlined for Flickr-style layout.
  <!-- - **SEO**: Structured data, meta tags, and sitemap generation -->
  <!-- - **Accessibility**: Keyboard navigation and semantic HTML -->

## Environment Variables

### Local Development
For local development, you typically don't need environment variables. The build system will read images directly from `src/content/` and use preview files you generate with `npm run build:previews`.

### Cloudflare Pages Deployment
To deploy on Cloudflare Pages, you must set the following environment variables in your Cloudflare Pages project settings:

- `R2_ENDPOINT` - Your Cloudflare R2 endpoint URL (format: `https://<account-id>.r2.cloudflarestorage.com`)
- `R2_ACCESS_KEY_ID` - Your R2 access key ID
- `R2_SECRET_ACCESS_KEY` - Your R2 secret access key

These credentials allow the build process to list images from your R2 bucket and extract their dimensions from the filename metadata.

**Important**: Store these as environment variables in Cloudflare Pages settings, NOT in `.env` or committed code.

## Installation

After cloning the project, you only need to install the dependencies using:

```bash
npm install
```

## Building

The project can be built using the following command:

```bash
npm run build
```

The build step can be long the first time due to generating image previews. After the first build, an incremental build takes around 3s for ~700 photos.

## Developing

The project can be developed and ran locally using:

```bash
npm run start
```

It will not properly display images until `npm run build:previews` has been ran with the current images.

## Image Storing

Photos are kept in the `src/content/` directory. Within that directory is:

### /events/

Holds subdirectories for each event, where images are stored. Directory names will be the slugs in the URLs.

### /images/

Holds standalone photos (e.g. sharing after-game jersey swaps)

### /portfolio/

Holds subdirectories for each category of portfolio work, where images are stored. Directory names will be the slugs in the URLs.

### meta.json

Holds all the metadata for each event and portfolio category.

## Scripts

Within the `src/scripts/` directory is:

### clear-previews.js

Run this script to delete any files ending with `_preview.webp` in event and portfolio folders.

### generate-previews.js

Run this script to generate previews for any files matching this regex: `/\.(jpe?g|png|webp)$/i` in event and portfolio folders.

### create_gif.py

Run this script to create a gif from a folder of images.

### batch_pad_images.py

Run this script to automatically create single color padding around a folder of images.

### upload-to-r2.js

Uploads images from `src/content/` to your Cloudflare R2 bucket. This must be run before deploying to Cloudflare Pages. Requires R2 credentials to be set in `.env` file locally.

### list-r2-photos.js

Lists all photos currently in your R2 bucket. Shows:
- Original images with their dimensions and file sizes
- Preview images with their dimensions and file sizes
- Total count and total storage used
- Warning if any original images are missing previews

Run with: `npm run list-photos`

### generate-worker-config.js

Generates the worker authentication configuration from the local `imageMetadata.json` file. Updates `src/workers/auth.js` with gallery passwords and image URLs for password-protected galleries.

## Deployment Workflow

### 1. Local Development
```bash
npm install
npm run build:previews  # Generate preview images
npm run start           # Start local development server
```

Images are read directly from `src/content/` - no uploaded images needed for local dev.

### 2. Before Deploying to Cloudflare Pages

**Upload Images to R2:**
```bash
npm run upload
```

This script:
- Reads all images from `src/content/`
- Uploads them to R2 with dimensions embedded in filenames (e.g., `image__w1920h1080.jpg`)
- Generates and uploads preview images
- Saves `imageMetadata.json` locally (gitignored)

**Deploy Worker (if using password-protected galleries):**
```bash
npm run worker:run
```

This script:
- Reads `imageMetadata.json` and `galleryPasswords.json`
- Updates `src/workers/auth.js` with current passwords and image URLs
- Deploys the worker to Cloudflare

**Important**: The `src/workers/auth.js` file is gitignored and contains sensitive data (passwords). It must be generated locally and deployed separately.

### 3. Push to GitHub
After uploading and deploying the worker, commit and push your changes:
```bash
git add .
git commit -m "Update gallery metadata"
git push
```

The following files are gitignored and will NOT be committed:
- `src/content/**/*` (actual image files)
- `src/_data/imageMetadata.json` (R2 cache)
- `src/_data/galleryPasswords.json` (passwords)
- `src/workers/auth.js` (worker auth config)

### 4. Cloudflare Pages Build
When you push to GitHub, Cloudflare Pages automatically:
1. Installs dependencies
2. Runs `npm run build`
3. The build system detects it's on Cloudflare Pages
4. `galleries.js` lists all objects from your R2 bucket
5. Dimensions are extracted from filenames
6. Gallery metadata is generated dynamically
7. Output is deployed to `pbsv.photo`

**Note**: You must have set the R2 environment variables in Cloudflare Pages settings for this to work.
