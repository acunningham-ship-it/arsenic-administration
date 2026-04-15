// ---- Mobile menu toggle ----
const toggle = document.querySelector('.nav-toggle');
const mobileMenu = document.querySelector('.mobile-menu');

toggle.addEventListener('click', () => {
  mobileMenu.classList.toggle('active');
});

// Close mobile menu on link click
mobileMenu.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('active');
  });
});

// ---- Scroll animations ----
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Animate sections on scroll
document.querySelectorAll('.section-label, .section-title, .section-subtitle, .about-text, .about-terminal, .game-card, .team-card, .contact-card, .upcoming-banner, .contact-disclaimer').forEach(el => {
  el.classList.add('fade-in');
  observer.observe(el);
});

// Add fade-in styles dynamically
const style = document.createElement('style');
style.textContent = `
  .fade-in {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .fade-in.visible {
    opacity: 1;
    transform: translateY(0);
  }
`;
document.head.appendChild(style);

// ---- Nav background on scroll ----
const nav = document.querySelector('.nav');
window.addEventListener('scroll', () => {
  if (window.scrollY > 50) {
    nav.style.borderBottomColor = 'rgba(255, 45, 45, 0.1)';
  } else {
    nav.style.borderBottomColor = '';
  }
});
