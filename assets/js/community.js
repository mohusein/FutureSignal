(() => {
  const config = window.FUTURESIGNAL_SUPABASE;
  const statusNodes = [...document.querySelectorAll("[data-supabase-status], [data-engagement-status], [data-reading-list-status]")];
  const setStatus = (node, message, kind = "info") => {
    if (!node) return;
    node.textContent = message;
    node.dataset.state = kind;
  };

  if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
    statusNodes.forEach(node => setStatus(node, "Community features need a Supabase project URL and public key. See the setup steps in README.md.", "setup"));
    document.querySelectorAll("[data-community-form] button, [data-auth-form] button, [data-profile-form] button, [data-dashboard] button, [data-engagement] button, [data-reading-list] button").forEach(button => { button.disabled = true; });
    return;
  }

  const client = window.supabase.createClient(config.url, config.anonKey);
  window.futureSignalSupabase = client;

  const authPage = document.querySelector("[data-auth-page]");
  if (authPage) setupAuth(client, authPage);
  document.querySelectorAll("[data-comments]").forEach(section => setupComments(client, section));
  const moderation = document.querySelector("[data-moderation]");
  if (moderation) setupModeration(client, moderation);
  const dashboard = document.querySelector("[data-dashboard]");
  if (dashboard) setupDashboard(client, dashboard);
  const articleView = document.querySelector("[data-article-view]");
  if (articleView) recordArticleView(client, articleView.dataset.articleSlug);
  const engagement = document.querySelector("[data-engagement]");
  if (engagement) setupEngagement(client, engagement);
  const readingList = document.querySelector("[data-reading-list]");
  if (readingList) setupReadingList(client, readingList);

  function setupAuth(supabaseClient, root) {
    const message = root.querySelector("[data-supabase-status]");
    const form = root.querySelector("[data-auth-form]");
    const signedIn = root.querySelector("[data-signed-in]");
    const userLabel = root.querySelector("[data-current-user]");
    const signOut = root.querySelector("[data-sign-out]");
    const resetForm = root.querySelector("[data-reset-form]");
    const resetPasswordForm = root.querySelector("[data-new-password-form]");
    const profileForm = root.querySelector("[data-profile-form]");

    const displaySession = session => {
      root.dataset.session = session ? "signed-in" : "signed-out";
      if (signedIn) signedIn.hidden = !session;
      if (userLabel) userLabel.textContent = session ? `Signed in as ${session.user.user_metadata?.display_name || session.user.email}` : "";
      if (profileForm && session) {
        profileForm.elements.display_name.value = session.user.user_metadata?.display_name || "";
        profileForm.elements.bio.value = session.user.user_metadata?.bio || "";
      }
    };
    supabaseClient.auth.getSession().then(({ data, error }) => {
      if (error) setStatus(message, error.message, "error");
      displaySession(data?.session);
    });
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        if (resetPasswordForm) resetPasswordForm.hidden = false;
        setStatus(message, "Choose a new password.", "info");
      }
      displaySession(session);
    });

    form?.addEventListener("submit", async event => {
      event.preventDefault();
      const data = new FormData(form);
      const mode = data.get("mode");
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      const displayName = String(data.get("display_name") || "").trim();
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        let result;
        if (mode === "signup") {
          result = await supabaseClient.auth.signUp({
            email, password,
            options: { data: { display_name: displayName }, emailRedirectTo: location.href.split("#")[0] }
          });
          if (!result.error) setStatus(message, "Check your email to confirm your account, then sign in.", "success");
        } else {
          result = await supabaseClient.auth.signInWithPassword({ email, password });
        }
        if (result.error) setStatus(message, result.error.message, "error");
        else if (mode !== "signup") setStatus(message, "You are signed in.", "success");
      } catch (error) {
        setStatus(message, error.message || "Could not reach Supabase.", "error");
      } finally {
        submit.disabled = false;
      }
    });

    profileForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = profileForm.querySelector('button[type="submit"]');
      const displayName = profileForm.elements.display_name.value.trim();
      const bio = profileForm.elements.bio.value.trim();
      if (!displayName) {
        setStatus(message, "Add a display name before saving your profile.", "error");
        return;
      }
      submit.disabled = true;
      const { data, error } = await supabaseClient.auth.updateUser({ data: { display_name: displayName, bio } });
      submit.disabled = false;
      if (error) setStatus(message, "Your profile could not be saved. Please try again.", "error");
      else {
        displaySession(data.user ? { user: data.user } : null);
        setStatus(message, "Your profile has been saved.", "success");
      }
    });

    resetForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const email = String(new FormData(resetForm).get("email") || "").trim();
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("#")[0] });
      setStatus(message, error ? error.message : "If that address has an account, a password reset email is on its way.", error ? "error" : "success");
    });

    resetPasswordForm?.addEventListener("submit", async event => {
      event.preventDefault();
      const password = String(new FormData(resetPasswordForm).get("new_password") || "");
      const { error } = await supabaseClient.auth.updateUser({ password });
      setStatus(message, error ? error.message : "Password updated.", error ? "error" : "success");
      if (!error) resetPasswordForm.hidden = true;
    });

    signOut?.addEventListener("click", async () => {
      const { error } = await supabaseClient.auth.signOut();
      setStatus(message, error ? error.message : "You are signed out.", error ? "error" : "success");
      if (!error) displaySession(null);
    });
  }

  function setupComments(supabaseClient, section) {
    const slug = section.dataset.articleSlug;
    const list = section.querySelector("[data-comment-list]");
    const form = section.querySelector("[data-community-form]");
    const message = section.querySelector("[data-supabase-status]");
    const signedOut = section.querySelector("[data-signed-out]");
    const signedIn = section.querySelector("[data-comment-form-wrap]");
    if (!slug || !list) return;

    const element = (tag, className, value) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value !== undefined) node.textContent = value;
      return node;
    };

    async function renderComments() {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const session = sessionData?.session;
      if (signedOut) signedOut.hidden = Boolean(session);
      if (signedIn) signedIn.hidden = !session;
      list.replaceChildren();
      const { data, error } = await supabaseClient
        .from("article_comments")
        .select("id, display_name, body, status, created_at, user_id")
        .eq("article_slug", slug)
        .order("created_at", { ascending: true });
      if (error) {
        setStatus(message, "Comments could not load. Check the Supabase setup.", "error");
        return;
      }
      if (!data?.length) {
        list.append(element("p", "muted", "No approved comments yet. Start the conversation."));
        return;
      }
      data.forEach(comment => {
        const card = element("article", "comment-card");
        const byline = comment.display_name + " · " + new Date(comment.created_at).toLocaleDateString();
        card.append(element("p", "comment-byline", byline));
        card.append(element("p", "comment-body", comment.body));
        if (session?.user?.id === comment.user_id && comment.status === "pending") {
          card.append(element("span", "status", "Awaiting approval"));
        }
        list.append(card);
      });
    }

    form?.addEventListener("submit", async event => {
      event.preventDefault();
      const bodyField = form.querySelector('[name="body"]');
      const body = bodyField.value.trim();
      if (!body || body.length > 4000) {
        setStatus(message, "Comments must be between 1 and 4,000 characters.", "error");
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      const { error } = await supabaseClient.from("article_comments").insert({ article_slug: slug, body });
      button.disabled = false;
      if (error) {
        setStatus(message, error.message.includes("wait") ? error.message : "Your comment could not be submitted. Please try again.", "error");
        return;
      }
      form.reset();
      setStatus(message, "Thanks. Your comment is waiting for approval.", "success");
      await renderComments();
    });

    supabaseClient.auth.onAuthStateChange(() => { renderComments(); });
    renderComments();
  }

  function setupModeration(supabaseClient, root) {
    const message = root.querySelector("[data-supabase-status]");
    const queue = root.querySelector("[data-pending-list]");
    const empty = root.querySelector("[data-moderation-empty]");

    async function loadQueue() {
      queue.replaceChildren();
      const { data: userData } = await supabaseClient.auth.getUser();
      if (!userData?.user) {
        setStatus(message, "Sign in with the site moderator account to review comments.", "info");
        return;
      }
      const { data: moderator, error: moderatorError } = await supabaseClient.rpc("is_site_moderator");
      if (moderatorError || moderator !== true) {
        setStatus(message, "This account is not listed as a site moderator.", "error");
        return;
      }
      const { data, error } = await supabaseClient
        .from("article_comments")
        .select("id, article_slug, display_name, body, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) {
        setStatus(message, "The moderation queue could not load.", "error");
        return;
      }
      setStatus(message, data.length ? "Review pending comments below." : "The moderation queue is clear.", "success");
      empty.hidden = data.length > 0;
      data.forEach(comment => {
        const card = document.createElement("article");
        card.className = "moderation-card";
        const heading = document.createElement("h3");
        heading.textContent = comment.article_slug + " · " + comment.display_name;
        const body = document.createElement("p");
        body.textContent = comment.body;
        const date = document.createElement("p");
        date.className = "muted";
        date.textContent = new Date(comment.created_at).toLocaleString();
        const actions = document.createElement("div");
        actions.className = "moderation-actions";
        for (const [status, label] of [["approved", "Approve"], ["rejected", "Reject"]]) {
          const button = document.createElement("button");
          button.className = status === "approved" ? "button" : "button secondary";
          button.type = "button";
          button.textContent = label;
          button.addEventListener("click", async () => {
            button.disabled = true;
            const { error: updateError } = await supabaseClient
              .from("article_comments").update({ status }).eq("id", comment.id);
            if (updateError) {
              button.disabled = false;
              setStatus(message, "Could not update that comment.", "error");
            } else {
              await loadQueue();
            }
          });
          actions.append(button);
        }
        card.append(heading, body, date, actions);
        queue.append(card);
      });
    }
    supabaseClient.auth.onAuthStateChange(() => loadQueue());
    loadQueue();
  }

  function recordArticleView(supabaseClient, slug) {
    if (!/^[a-z0-9-]{1,100}$/.test(slug || "")) return;
    const key = `futuresignal:viewed:${slug}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch (_) {
      // Private browsing settings can disable session storage; the page remains usable.
    }
    supabaseClient.rpc("record_article_view", { p_article_slug: slug }).then(({ error }) => {
      if (error) console.info("Article view metrics are unavailable until the Supabase schema is configured.");
    });
  }

  function setupDashboard(supabaseClient, root) {
    const message = root.querySelector("[data-supabase-status]");
    const summary = root.querySelector("[data-dashboard-summary]");
    const list = root.querySelector("[data-dashboard-list]");
    const empty = root.querySelector("[data-dashboard-empty]");
    const refresh = root.querySelector("[data-dashboard-refresh]");
    const totals = {
      views: root.querySelector("[data-total-views]"),
      comments: root.querySelector("[data-total-comments]"),
      pending: root.querySelector("[data-total-pending]"),
      recent: root.querySelector("[data-total-recent]")
    };

    async function loadDashboard() {
      refresh.disabled = true;
      list.replaceChildren();
      const { data: userData, error: userError } = await supabaseClient.auth.getUser();
      if (userError || !userData?.user) {
        summary.hidden = true;
        setStatus(message, "Sign in with the site owner account to view publishing analytics.", "info");
        refresh.disabled = false;
        return;
      }
      const { data: moderator, error: moderatorError } = await supabaseClient.rpc("is_site_moderator");
      if (moderatorError || moderator !== true) {
        summary.hidden = true;
        setStatus(message, "This dashboard is limited to the site owner and moderators.", "error");
        refresh.disabled = false;
        return;
      }
      const { data, error } = await supabaseClient.rpc("get_site_analytics");
      if (error) {
        summary.hidden = true;
        setStatus(message, "Analytics could not load. Apply the latest supabase/schema.sql setup first.", "error");
        refresh.disabled = false;
        return;
      }
      const rows = data || [];
      summary.hidden = false;
      totals.views.textContent = rows.reduce((sum, row) => sum + Number(row.total_views || 0), 0).toLocaleString();
      totals.comments.textContent = rows.reduce((sum, row) => sum + Number(row.approved_comments || 0), 0).toLocaleString();
      totals.pending.textContent = rows.reduce((sum, row) => sum + Number(row.pending_comments || 0), 0).toLocaleString();
      totals.recent.textContent = rows.reduce((sum, row) => sum + Number(row.views_30_days || 0), 0).toLocaleString();
      empty.hidden = rows.length > 0;
      rows.forEach(row => {
        const card = document.createElement("article");
        card.className = "dashboard-article-card";
        const title = document.createElement("h3");
        title.textContent = row.article_slug.replaceAll("-", " ");
        const stats = document.createElement("p");
        stats.className = "muted";
        stats.textContent = `${Number(row.total_views).toLocaleString()} views · ${Number(row.views_30_days).toLocaleString()} in 30 days · ${Number(row.approved_comments).toLocaleString()} approved comments · ${Number(row.pending_comments).toLocaleString()} pending`;
        const link = document.createElement("a");
        link.className = "read-link";
        link.href = `articles/${encodeURIComponent(row.article_slug)}.html`;
        link.textContent = "Open article →";
        card.append(title, stats, link);
        list.append(card);
      });
      setStatus(message, "Analytics updated. Views are anonymous daily totals; no visitor profiles or IP addresses are stored.", "success");
      refresh.disabled = false;
    }
    refresh?.addEventListener("click", loadDashboard);
    loadDashboard();
  }

  const articleTitles = {
    "ai-software-engineering": "How AI is changing the work of software engineering",
    "how-websites-work": "How a website gets from a server to your screen",
    "quantum-computing": "Quantum computing beyond classical limits"
  };

  function setupEngagement(supabaseClient, root) {
    const slug = root.dataset.articleSlug;
    const message = root.querySelector("[data-engagement-status]");
    const signedOut = root.querySelector("[data-engagement-signed-out]");
    const reactionButtons = [...root.querySelectorAll("[data-reaction]")];
    const bookmark = root.querySelector("[data-bookmark-toggle]");
    let user = null;
    if (!slug || !articleTitles[slug]) return;

    async function refresh() {
      const [{ data: userData }, countsResult] = await Promise.all([
        supabaseClient.auth.getUser(),
        supabaseClient.rpc("get_article_reaction_counts", { p_article_slug: slug })
      ]);
      user = userData?.user || null;
      if (signedOut) signedOut.hidden = Boolean(user);
      if (countsResult.error) {
        setStatus(message, "Reader reactions need the latest Supabase setup.", "setup");
        return;
      }
      const counts = new Map((countsResult.data || []).map(item => [item.reaction_type, Number(item.total_reactions || 0)]));
      reactionButtons.forEach(button => {
        const kind = button.dataset.reaction;
        const count = button.querySelector("[data-reaction-count]");
        if (count) count.textContent = (counts.get(kind) || 0).toLocaleString();
        button.setAttribute("aria-pressed", "false");
      });
      if (!user) {
        bookmark.setAttribute("aria-pressed", "false");
        bookmark.textContent = "Save to reading list";
        setStatus(message, "Reactions are public totals. Sign in to react or save this article.", "info");
        return;
      }
      const [reactions, saved] = await Promise.all([
        supabaseClient.from("article_reactions").select("reaction_type").eq("article_slug", slug),
        supabaseClient.from("article_bookmarks").select("article_slug").eq("article_slug", slug).maybeSingle()
      ]);
      if (reactions.error || saved.error) {
        setStatus(message, "Your saved reactions need the latest Supabase schema.", "setup");
        return;
      }
      (reactions.data || []).forEach(item => {
        const button = reactionButtons.find(candidate => candidate.dataset.reaction === item.reaction_type);
        button?.setAttribute("aria-pressed", "true");
      });
      const isSaved = Boolean(saved.data);
      bookmark.setAttribute("aria-pressed", String(isSaved));
      bookmark.textContent = isSaved ? "Remove from reading list" : "Save to reading list";
      setStatus(message, "Your reactions and reading list are saved to your account.", "success");
    }

    reactionButtons.forEach(button => button.addEventListener("click", async () => {
      if (!user) {
        setStatus(message, "Sign in to leave a reaction. Use the sign-in link below.", "info");
        return;
      }
      reactionButtons.forEach(item => { item.disabled = true; });
      const { error } = await supabaseClient.rpc("toggle_article_reaction", {
        p_article_slug: slug,
        p_reaction_type: button.dataset.reaction
      });
      reactionButtons.forEach(item => { item.disabled = false; });
      if (error) setStatus(message, "Your reaction could not be saved. Please try again.", "error");
      else await refresh();
    }));

    bookmark.addEventListener("click", async () => {
      if (!user) {
        setStatus(message, "Sign in to save this article to your reading list.", "info");
        return;
      }
      bookmark.disabled = true;
      const exists = bookmark.getAttribute("aria-pressed") === "true";
      const request = exists
        ? supabaseClient.from("article_bookmarks").delete().eq("article_slug", slug).eq("user_id", user.id)
        : supabaseClient.from("article_bookmarks").insert({ article_slug: slug, user_id: user.id });
      const { error } = await request;
      bookmark.disabled = false;
      if (error) setStatus(message, "Your reading list could not be updated. Please try again.", "error");
      else await refresh();
    });

    supabaseClient.auth.onAuthStateChange(() => { refresh(); });
    refresh();
  }

  function setupReadingList(supabaseClient, root) {
    const message = root.querySelector("[data-reading-list-status]");
    const list = root.querySelector("[data-reading-list-items]");
    const signedOut = root.querySelector("[data-reading-list-signed-out]");

    async function render() {
      list.replaceChildren();
      const { data: userData } = await supabaseClient.auth.getUser();
      const user = userData?.user;
      if (signedOut) signedOut.hidden = Boolean(user);
      if (!user) {
        setStatus(message, "Sign in to see articles you have saved.", "info");
        return;
      }
      const { data, error } = await supabaseClient.from("article_bookmarks")
        .select("article_slug, created_at").order("created_at", { ascending: false });
      if (error) {
        setStatus(message, "Your reading list could not load. Check the Supabase schema setup.", "error");
        return;
      }
      const saved = (data || []).filter(item => articleTitles[item.article_slug]);
      if (!saved.length) {
        setStatus(message, "Your reading list is empty. Save an article to keep it here.", "info");
        return;
      }
      setStatus(message, `${saved.length} saved ${saved.length === 1 ? "article" : "articles"}.`, "success");
      saved.forEach(item => {
        const card = document.createElement("article");
        card.className = "dashboard-article-card reading-list-card";
        const title = document.createElement("h2");
        title.textContent = articleTitles[item.article_slug];
        const date = document.createElement("p");
        date.className = "muted";
        date.textContent = `Saved ${new Date(item.created_at).toLocaleDateString()}`;
        const actions = document.createElement("div");
        actions.className = "reading-list-actions";
        const open = document.createElement("a");
        open.className = "read-link";
        open.href = `articles/${encodeURIComponent(item.article_slug)}.html`;
        open.textContent = "Read article →";
        const remove = document.createElement("button");
        remove.className = "button secondary";
        remove.type = "button";
        remove.textContent = "Remove";
        remove.addEventListener("click", async () => {
          remove.disabled = true;
          const { error: deleteError } = await supabaseClient.from("article_bookmarks")
            .delete().eq("article_slug", item.article_slug).eq("user_id", user.id);
          if (deleteError) {
            remove.disabled = false;
            setStatus(message, "That article could not be removed. Please try again.", "error");
          } else {
            await render();
          }
        });
        actions.append(open, remove);
        card.append(title, date, actions);
        list.append(card);
      });
    }
    supabaseClient.auth.onAuthStateChange(() => { render(); });
    render();
  }
})();
