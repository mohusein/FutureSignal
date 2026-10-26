(() => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('is-open', !open);
  });

  const grid = document.querySelector('[data-archive-grid]');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('[data-article]')];
  const search = document.querySelector('[data-search]');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const count = document.querySelector('[data-results-count]');
  const empty = document.querySelector('[data-empty]');
  let category = 'all';
  const update = () => {
    const term = (search?.value || '').trim().toLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const categories = card.dataset.category.split(' ');
      const haystack = `${card.dataset.title} ${card.dataset.description} ${card.dataset.tags}`.toLowerCase();
      const show = (category === 'all' || categories.includes(category)) && (!term || haystack.includes(term));
      card.hidden = !show;
      if (show) visible++;
    });
    count.textContent = `${visible} ${visible === 1 ? 'article' : 'articles'}`;
    empty.hidden = visible > 0;
  };
  search?.addEventListener('input', update);
  filters.forEach(button => button.addEventListener('click', () => {
    category = button.dataset.filter;
    filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    update();
  }));
  update();
})();
