(() => {
  const config = window.FUTURESIGNAL_SUPABASE;
  const statusNodes = [...document.querySelectorAll("[data-supabase-status]")];
  const setStatus = (node, message, kind = "info") => {
    if (!node) return;
    node.textContent = message;
    node.dataset.state = kind;
  };

  if (!config?.url || !config?.anonKey || !window.supabase?.createClient) {
    statusNodes.forEach(node => setStatus(node, "Community features need a Supabase project URL and public key. See the setup steps in README.md.", "setup"));
    document.querySelectorAll("[data-community-form] button, [data-auth-form] button, [data-profile-form] button, [data-dashboard] button").forEach(button => { button.disabled = true; });
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
})();
