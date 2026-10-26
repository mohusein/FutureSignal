# FutureSignal

Personal software engineering portfolio and interactive research publication for Mulki Husein, built with HTML, CSS, and JavaScript. It highlights her software projects, IT experience, research, education, and transition into software engineering. The static structure keeps the project easy to inspect and suitable for GitHub Pages at either a user-site root or a project-site subpath.

## Structure

- `index.html` — Mulki Husein’s portfolio homepage
- `about.html` — career direction, experience, education, and recognition
- `research/index.html` — selected publications and research contributions
- `articles/` — three starter research articles with moderated comment sections
- `auth.html`, `moderation.html` — account and moderator pages
- `dashboard.html` — moderator-only aggregate article and comment analytics
- `reading-list.html` — a signed-in reader's private saved articles
- `supabase/schema.sql` — database schema, row-level policies, moderation, reactions, bookmarks, and aggregate analytics
- `assets/js/community.js`, `assets/js/supabase-config.js` — browser community features and public Supabase configuration
- `projects/index.html` — software and technical project portfolio
- `assets/css/styles.css` — shared visual system and responsive layout
- `assets/js/main.js` — mobile navigation plus live search and category filters for the writing archive
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

Row-level security is enabled on community tables. The browser can read approved comments and a signed-in author's own pending comments; only moderator accounts can see the full queue or change comment status. Readers can edit a display name and private account bio, react to articles, and keep a private reading list. Reaction totals are public aggregates; each reader can only see or manage their own reaction and bookmark rows. Comment text is rendered as text, and the database rejects overlong or rapid repeated submissions.

The publishing dashboard is available at `dashboard.html` to moderator accounts only. It reports aggregate article views and comment counts. View data is stored as daily totals without IP addresses or visitor identifiers; the browser counts at most one view per article per tab session. The `article_daily_views` table has no direct public or client access; the dashboard uses a moderator-checked database function. Counts are indicative and can be affected by automated traffic.

The three previously published works in the research archive link to their original publisher pages. Their full text is not copied into this repository. The submitted articles can be added as full FutureSignal pages when you provide the manuscript text and confirm it may be republished.

## Publish with GitHub Pages

The site is published from the `main` branch of `mohusein/FutureSignal` at [https://mohusein.github.io/FutureSignal/](https://mohusein.github.io/FutureSignal/). GitHub Pages serves the static files. Supabase remains a separate setup step for account, comment, and dashboard data.

GitHub Pages project sites use a repository subpath, so keep links relative as they are now. Do not publish a guessed `USERNAME.github.io` URL or sitemap.

## Editorial and privacy notes

Article publication dates and an individual author identity have not been supplied; these pages clearly show that dates are pending. The projects page includes only the high-level project facts given in the brief. Implementation details and results need confirmation before they are published. Do not add employer-confidential details, customer information, secrets, or proprietary code.
