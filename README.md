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

<!-- ## Environment Variables

To run this project, you will need to create a `.env` file in the root directory and add the following environment variables to it:

- `FLICKR_API_KEY`, a Flickr API key, used to retrieve the pictures.
- `MAPBOX_ACCESS_TOKEN`, a Mapbox access token with access to the `Static Images API` and `Temporary Geocoding API`, used to generate the map preview found in the picture pages and the reverse geocoding informations.
- `MAPBOX_PUBLIC_ACCESS_TOKEN`, a Mapbox public access token, used for the `/map/` page.

Additionally, the [content.config.ts](src/content.config.ts) file should be updated to fetch data from another Flickr album. -->

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
