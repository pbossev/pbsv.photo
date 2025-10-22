module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/content/**/*.jpg");
  eleventyConfig.addPassthroughCopy("src/content/**/*.webp");
  eleventyConfig.addPassthroughCopy({ "src/assets/favicon": "/" });

  return {
    dir: {
      input: "src",
      output: "_site",
    },
    passthroughFileCopy: true
  };
};