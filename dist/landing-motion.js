(() => {
  const stage = document.querySelector('.totem-hero-stage');
  const model = document.querySelector('.totem-hero-model');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (stage && model && !reduced) {
    stage.addEventListener('pointermove', event => {
      const box = stage.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - .5;
      const y = (event.clientY - box.top) / box.height - .5;
      model.style.transform = `translateY(-8px) rotateY(${x * 22}deg) rotateX(${-y * 16}deg)`;
    });
    stage.addEventListener('pointerleave', () => { model.style.transform = ''; });
  }
  const sections = [...document.querySelectorAll('[data-screen-label="01 Landing"] > div, [data-screen-label="01 Landing"] > div > div > h2')];
  sections.forEach(section => section.classList.add('totem-reveal'));
  if (reduced || !('IntersectionObserver' in window)) {
    sections.forEach(section => section.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  sections.forEach(section => observer.observe(section));
})();
