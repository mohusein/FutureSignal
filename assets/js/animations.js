(() => {
  if (!window.gsap || !window.ScrollTrigger) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches) return;

  const { gsap, ScrollTrigger } = window;
  gsap.registerPlugin(ScrollTrigger);

  const intro = document.querySelector(".hero-content, .page-hero");
  if (intro) {
    const introItems = intro.matches(".hero-content")
      ? intro.children
      : intro.children;
    gsap.from(introItems, {
      autoAlpha: 0,
      y: 22,
      duration: 0.65,
      stagger: 0.08,
      ease: "power2.out",
      clearProps: "all"
    });
  }

  const revealGroups = [
    ".feature",
    ".card",
    ".project-detail",
    ".timeline-item",
    ".skill-card",
    ".metric-card",
    ".dashboard-article-card",
    ".engagement-panel",
    ".comment-card",
    ".achievement-list li"
  ];

  revealGroups.forEach(selector => {
    gsap.utils.toArray(selector).forEach(element => {
      gsap.fromTo(element,
        { autoAlpha: 0, y: 20 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.55,
          ease: "power2.out",
          clearProps: "all",
          scrollTrigger: {
            trigger: element,
            start: "top 88%",
            once: true
          }
        }
      );
    });
  });
})();
