# FutureSignal

Personal website and a dependency-free, multipage technology research publication built with HTML, CSS, and a small amount of JavaScript. The static structure keeps the project easy to inspect and suitable for GitHub Pages at either a user-site root or a project-site subpath.

## Structure

- `index.html` — publication homepage
- `about.html` — mission and editorial method
- `research/index.html` — searchable, category-filterable article archive
- `articles/` — three individual research articles
- `projects/index.html` — project notebook with carefully scoped descriptions
- `assets/css/styles.css` — shared visual system and responsive layout
- `assets/js/main.js` — mobile navigation and archive filtering
- `404.html`, `robots.txt` — basic site support files

All links are relative to the current page. This lets the same files work at `/` or `/RepositoryName/` without a build step or path configuration.

## Preview locally

Open `index.html` in a browser, or run a local static server from this directory:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. Stop the server with Ctrl+C.

## Add an article

1. Copy an existing file from `articles/` and replace its title, introduction, sections, and reference list.
2. Keep semantic headings in order (`h1` for the title, `h2` for main sections). Update the table-of-contents links to match section IDs.
3. Add an archive card in `research/index.html`. Set `data-category` to one of `ai`, `quantum`, or `web`; include searchable title, description, and tags.
4. Add the article to the homepage if it should be featured.
5. Use working primary/official references where possible. Keep research limitations and publication dates accurate.
6. Check paths from the article folder (`../assets/...`) and links from the archive (`../articles/...`).

## Publish with GitHub Pages

The repository was not accessible in the initial workspace, so the repository name, default branch, Pages settings, final URL, and domain are not confirmed here.

Once the existing repository is connected:

1. Inspect its default branch and existing files before copying these site files into it.
2. Preserve repository-specific documentation and useful existing work.
3. In GitHub, open **Settings → Pages** and select **Deploy from a branch**, the chosen default branch, and `/ (root)` if the site files are at the repository root.
4. Wait for the Pages deployment to complete, then use the URL shown in Pages settings.
5. Verify homepage, CSS, JavaScript, navigation, article links, and the 404 page at that URL.
6. Only after confirming the URL, add canonical URLs, a sitemap with absolute URLs, and matching Open Graph metadata.

GitHub Pages project sites use a repository subpath, so keep links relative as they are now. Do not publish a guessed `USERNAME.github.io` URL or sitemap.

## Editorial and privacy notes

Article publication dates and an individual author identity have not been supplied; these pages clearly show that dates are pending. The projects page includes only the high-level project facts given in the brief. Implementation details and results need confirmation before they are published. Do not add employer-confidential details, customer information, secrets, or proprietary code.
