# FutureSignal

Personal software engineering portfolio and interactive research publication for Mulki Husein, built with HTML, CSS, and JavaScript. It highlights her software projects, IT experience, research, education, and transition into software engineering. The static structure keeps the project easy to inspect and suitable for GitHub Pages at either a user-site root or a project-site subpath.

## Structure

- `index.html` — Mulki Husein’s portfolio homepage
- `about.html` — career direction, experience, education, and recognition
- `research/index.html` — selected publications and research contributions
- `articles/` — three starter research articles with moderated comment sections
- `auth.html`, `moderation.html` — account and moderator pages
- `supabase/schema.sql` — database schema, row-level policies, and comment moderation rules
- `assets/js/community.js`, `assets/js/supabase-config.js` — browser community features and public Supabase configuration
- `projects/index.html` — software and technical project portfolio
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

## Enable accounts and moderated comments

The static site uses Supabase Auth and Postgres. The repository contains placeholders only; sign-in and comments remain inactive until you connect a Supabase project.

1. Create a Supabase project, then run `supabase/schema.sql` in its SQL Editor.
2. In **Authentication → URL Configuration**, set the deployed site as the Site URL and add the exact `auth.html` URL (plus its preview/local equivalents) to the redirect allow list. Sign-up confirmation and password recovery return to this page.
3. Keep email confirmation enabled. For production, configure your own SMTP provider in Supabase; its default email sender has strict low-volume limits.
4. Open `assets/js/supabase-config.js` and set `url` to the project URL and `anonKey` to the public publishable/anon key. These values are intended for browser use; never put a service-role or secret key in this file.
5. Create your account at `auth.html` and confirm the email. In the Supabase SQL Editor, grant that account moderator access by substituting the email used for your account:

   ```sql
   insert into public.site_moderators (user_id)
   select id from auth.users where email = 'you@example.com'
   on conflict (user_id) do nothing;
   ```

6. Sign in at `auth.html`, then open `moderation.html`. New comments are held as pending, and only approved comments appear publicly. You can approve or reject them from the moderation queue.

Row-level security is enabled on both tables. The browser can read approved comments and a signed-in author’s own pending comments; only moderator accounts can see the full queue or change comment status. Display names are derived from the authenticated account, comment text is rendered as text, and the database rejects overlong or rapid repeated submissions.

The three previously published works in the research archive link to their original publisher pages. Their full text is not copied into this repository. The submitted articles can be added as full FutureSignal pages when you provide the manuscript text and confirm it may be republished.

## Publish with GitHub Pages

The site is in `mohusein/FutureSignal` on the `main` branch. GitHub Pages deployment has not been configured or verified, so the live URL and domain are not confirmed.

The repository is currently private. GitHub Free includes Pages for public repositories; publishing the site from this private repository requires an eligible paid plan. Making the repository public also makes its source code public, so keep its current visibility unless you choose otherwise.

To deploy, open **Settings → Pages** and select **Deploy from a branch**, `main`, and `/ (root)`. Wait for deployment, then use the URL shown there to verify the homepage, CSS, JavaScript, navigation, article links, and 404 page. Add canonical URLs, a sitemap with absolute URLs, and matching Open Graph metadata only after confirming the live URL.

GitHub Pages project sites use a repository subpath, so keep links relative as they are now. Do not publish a guessed `USERNAME.github.io` URL or sitemap.

## Editorial and privacy notes

Article publication dates and an individual author identity have not been supplied; these pages clearly show that dates are pending. The projects page includes only the high-level project facts given in the brief. Implementation details and results need confirmation before they are published. Do not add employer-confidential details, customer information, secrets, or proprietary code.
