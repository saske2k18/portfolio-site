import CONFIG from './config.js';

// Check if we should use Supabase Cloud Mode
const useSupabase = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
const supabase = useSupabase && window.supabase ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

let allProjects = [];

document.addEventListener('DOMContentLoaded', () => {
  initCustomCursor();
  fetchAndRenderProjects();
  setupModal();
  setupInfoOverlayModal();
  setupHeaderScroll();
});

// 1. Custom Cursor Handler
function initCustomCursor() {
  const cursor = document.getElementById('custom-cursor');
  const cursorDot = document.getElementById('custom-cursor-dot');
  
  if (!cursor || !cursorDot) return;

  let mouseX = 0;
  let mouseY = 0;
  let cursorX = 0;
  let cursorY = 0;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    
    cursorDot.style.left = `${mouseX}px`;
    cursorDot.style.top = `${mouseY}px`;
  });

  function animateCursor() {
    const dx = mouseX - cursorX;
    const dy = mouseY - cursorY;
    
    cursorX += dx * 0.15;
    cursorY += dy * 0.15;
    
    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;
    
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  document.addEventListener('mouseover', (e) => {
    if (e.target.classList.contains('hoverable') || e.target.closest('.hoverable') || e.target.tagName === 'A' || e.target.tagName === 'BUTTON') {
      cursor.style.width = '48px';
      cursor.style.height = '48px';
      cursor.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      cursor.style.borderColor = 'var(--accent-color)';
      cursorDot.style.transform = 'translate(-50%, -50%) scale(2.5)';
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (e.target.classList.contains('hoverable') || e.target.closest('.hoverable') || e.target.tagName === 'A' || e.target.tagName === 'BUTTON') {
      cursor.style.width = '24px';
      cursor.style.height = '24px';
      cursor.style.backgroundColor = 'transparent';
      cursor.style.borderColor = 'var(--accent-color)';
      cursorDot.style.transform = 'translate(-50%, -50%) scale(1)';
    }
  });
}

// 2. Fetch Projects (Local / Supabase)
async function fetchAndRenderProjects() {
  const grid = document.getElementById('portfolio-grid');
  if (!grid) return;

  try {
    if (useSupabase && supabase) {
      console.log('Fetching projects from Supabase...');
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      allProjects = (data || []).map(p => ({
        ...p,
        coverImage: p.coverImage || p.coverimage
      }));
    } else {
      console.log('Fetching projects from Local API...');
      const response = await fetch('/api/projects');
      if (!response.ok) throw new Error('API server returned error');
      allProjects = await response.json();
    }
    renderProjects(allProjects);
  } catch (err) {
    console.error('Error fetching projects:', err);
    grid.innerHTML = `
      <div class="loading-status" style="color: #ff5c12;">
        Не удалось загрузить проекты. ${useSupabase ? 'Проверьте соединение с Supabase.' : 'Убедитесь, что сервер Node.js запущен на порту 3000.'}
      </div>
    `;
  }
}

// Category translation mapping
const CATEGORY_MAP = {
  '3d': '3D Графика',
  'motion': 'Моушн дизайн',
  'graphic': 'Графический дизайн',
  'presentation': 'Дизайн презентаций',
  'print': 'Верстка полиграфии'
};

// Project specific configurations: colors (body background), brightness, title fonts, and premium accent colors matching palettes
const PROJECT_THEMES = {
  '3d': { bgHex: '#0b0b0b', accentHex: '#dfb26c', fontClass: 'font-serif-dm', isDark: true },          // Gold accent on dark
  'motion': { bgHex: '#3b1eb0', accentHex: '#ff7df2', fontClass: 'font-display-syne', isDark: true },    // Neon pink accent on purple
  'presentation': { bgHex: '#ff2121', accentHex: '#ffd23f', fontClass: 'font-serif-playfair', isDark: true }, // Warm yellow accent on red
  'graphic': { bgHex: '#2fbfae', accentHex: '#0d0d0d', fontClass: 'font-display-outfit', isDark: false },  // Contrast dark accent on teal
  'print': { bgHex: '#6a7e72', accentHex: '#ffeaa7', fontClass: 'font-mono-tech', isDark: true }         // Wheat accent on sage green
};

// Cycle fallbacks with tailored accent colors
const THEME_CYCLE = [
  { bgHex: '#ff2121', accentHex: '#ffd23f', fontClass: 'font-serif-playfair', isDark: true },
  { bgHex: '#2fbfae', accentHex: '#0d0d0d', fontClass: 'font-display-outfit', isDark: false },
  { bgHex: '#3b1eb0', accentHex: '#ff7df2', fontClass: 'font-display-syne', isDark: true },
  { bgHex: '#6a7e72', accentHex: '#ffeaa7', fontClass: 'font-mono-tech', isDark: true },
  { bgHex: '#ff5c12', accentHex: '#ffffff', fontClass: 'font-display-outfit', isDark: true },
  { bgHex: '#0b0b0b', accentHex: '#dfb26c', fontClass: 'font-serif-dm', isDark: true }
];

// 3. Render Split-Screen Page Projects
function renderProjects(projects) {
  const visualGrid = document.getElementById('portfolio-grid');
  const infoContainer = document.getElementById('project-info-container');
  const pager = document.getElementById('projects-pager');
  
  if (!visualGrid || !infoContainer) return;

  if (projects.length === 0) {
    visualGrid.innerHTML = `
      <div class="loading-status">
        <p>Пока нет загруженных проектов.</p>
      </div>
    `;
    infoContainer.innerHTML = '';
    if (pager) pager.innerHTML = '';
    return;
  }

  // Clear loading statuses
  visualGrid.innerHTML = '';
  infoContainer.innerHTML = '';
  if (pager) pager.innerHTML = '';
  
  projects.forEach((proj, idx) => {
    // 1. Get configurations for backgrounds and fonts
    const theme = PROJECT_THEMES[proj.category] || THEME_CYCLE[idx % THEME_CYCLE.length];
    
    // 2. Select Cover Visual
    let coverUrl = '/placeholder-cover.jpg';
    if (proj.coverImage) {
      coverUrl = proj.coverImage;
    }

    // 3. Render Left Column metadata text blocks (absolute overlay cards)
    const textBlock = document.createElement('div');
    textBlock.className = `info-text-block ${theme.fontClass}`;
    textBlock.id = `info-block-${proj.id}`;
    textBlock.innerHTML = `
      <div class="project-category">${CATEGORY_MAP[proj.category] || proj.category}</div>
      <h2 class="project-title">${proj.title}</h2>
      <p class="project-desc">${proj.description || 'Интерактивный кейс и визуальные материалы проекта.'}</p>
      <a href="javascript:void(0)" class="project-cta hoverable">
        Смотреть кейс
        <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1 7H21M21 7L15 1M21 7L15 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    `;
    
    // Modal trigger for left column CTA
    textBlock.querySelector('.project-cta').addEventListener('click', () => openProjectModal(proj));
    infoContainer.appendChild(textBlock);

    // 4. Render Right Column 3D Visual Blocks (flowing list scroll snapped)
    const visualItem = document.createElement('div');
    visualItem.className = `project-visual-item ${theme.fontClass}`;
    visualItem.dataset.id = proj.id;
    visualItem.innerHTML = `
      <!-- Mobile Fallback Content (Hidden on desktop, shown on mobile) -->
      <div class="mobile-meta-content">
        <div class="project-category">${CATEGORY_MAP[proj.category] || proj.category}</div>
        <h2 class="project-title">${proj.title}</h2>
        <p class="project-desc">${proj.description || 'Интерактивный кейс и визуальные материалы проекта.'}</p>
        <a href="javascript:void(0)" class="project-cta mobile-cta hoverable">
          Смотреть кейс
          <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1 7H21M21 7L15 1M21 7L15 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>

      <div class="project-visual-column hoverable">
        <div class="project-3d-stage">
          <div class="project-3d-panel">
            <img class="project-visual-img" src="${coverUrl}" alt="${proj.title}" loading="lazy">
          </div>
        </div>
      </div>
    `;

    // Modal triggers for mobile CTA and visual cards
    visualItem.querySelector('.mobile-cta').addEventListener('click', () => openProjectModal(proj));
    visualItem.querySelector('.project-visual-column').addEventListener('click', () => openProjectModal(proj));
    
    visualGrid.appendChild(visualItem);

    // 5. Render dynamic dots inside the right-hand dashboard pager
    if (pager) {
      const dot = document.createElement('div');
      dot.className = 'pager-dot hoverable';
      dot.dataset.idx = idx;
      dot.addEventListener('click', () => {
        const visualItems = document.querySelectorAll('.project-visual-item');
        if (visualItems[idx]) {
          visualItems[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      pager.appendChild(dot);
    }
  });

  // Setup dynamic intersections and 3D tilts
  setup3DTilt();
  setupVisualSnapObserver();

  // Scroll/snap the first project to the exact vertical center on load
  setTimeout(() => {
    const visualItems = document.querySelectorAll('.project-visual-item');
    if (visualItems[0]) {
      visualItems[0].scrollIntoView({ behavior: 'auto', block: 'center' });
    }
  }, 100);
}

// 4. Header background on scroll
function setupHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

// 5. 3D Tilt dynamic rotation effect on mouse movements
function setup3DTilt() {
  document.addEventListener('mousemove', (e) => {
    const stageWrapper = e.target.closest('.project-visual-column');
    if (!stageWrapper) return;

    const stage = stageWrapper.querySelector('.project-3d-stage');
    if (!stage) return;

    const rect = stageWrapper.getBoundingClientRect();
    const xPercent = (e.clientX - rect.left) / rect.width - 0.5;
    const yPercent = (e.clientY - rect.top) / rect.height - 0.5;

    // Softer rotation angles
    const rotateYVal = -12 + (xPercent * 12);
    const rotateXVal = 8 - (yPercent * 12);
    const rotateZVal = -2 + (xPercent * 2);
    
    stage.style.transform = `rotateY(${rotateYVal}deg) rotateX(${rotateXVal}deg) rotateZ(${rotateZVal}deg)`;
  });

  document.addEventListener('mouseout', (e) => {
    const stageWrapper = e.target.closest('.project-visual-column');
    if (!stageWrapper) return;

    if (stageWrapper.contains(e.relatedTarget)) return;

    const stage = stageWrapper.querySelector('.project-3d-stage');
    if (stage) {
      stage.style.transform = 'rotateY(-12deg) rotateX(8deg) rotateZ(-2deg)';
    }
  });
}

// 6. IntersectionObserver to coordinate fixed panel transitions with visual slides scroll snapping
function setupVisualSnapObserver() {
  const visualItems = document.querySelectorAll('.project-visual-item');
  const infoBlocks = document.querySelectorAll('.info-text-block');
  const pager = document.getElementById('projects-pager');
  
  if (visualItems.length === 0) return;

  const observerOptions = {
    root: null,
    rootMargin: '-45% 0px -45% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const activeId = entry.target.dataset.id;
        const activeIdx = Array.from(visualItems).indexOf(entry.target);
        const proj = allProjects[activeIdx];
        
        if (!proj) return;

        const theme = PROJECT_THEMES[proj.category] || THEME_CYCLE[activeIdx % THEME_CYCLE.length];

        document.body.style.backgroundColor = theme.bgHex;
        
        // Dynamically update global CSS accent color property on root element
        document.documentElement.style.setProperty('--accent-color', theme.accentHex);

        // Toggle text contrast themes (adjust header, fixed texts and pager indicator colors)
        if (theme.isDark) {
          document.body.style.color = '#ffffff';
          document.querySelector('.site-header')?.classList.remove('theme-dark-text');
          document.getElementById('project-info-container')?.classList.remove('theme-dark-text');
          pager?.classList.remove('theme-dark-text');
        } else {
          document.body.style.color = '#0d0d0d';
          document.querySelector('.site-header')?.classList.add('theme-dark-text');
          document.getElementById('project-info-container')?.classList.add('theme-dark-text');
          pager?.classList.add('theme-dark-text');
        }

        // Fade in matching info text block, fade out others
        infoBlocks.forEach(block => {
          if (block.id === `info-block-${activeId}`) {
            block.classList.add('active');
          } else {
            block.classList.remove('active');
          }
        });

        // Highlight matching pager indicator dot
        const dots = document.querySelectorAll('.pager-dot');
        dots.forEach((dot, dIdx) => {
          if (dIdx === activeIdx) {
            dot.classList.add('active');
          } else {
            dot.classList.remove('active');
          }
        });
      }
    });
  }, observerOptions);

  visualItems.forEach(item => observer.observe(item));
}

// 7. Resume & Contacts Overlay Modal Logic (Separate swiping panels inheriting active state colors)
function setupInfoOverlayModal() {
  const triggers = document.querySelectorAll('.modal-trigger');
  
  triggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const type = trigger.getAttribute('data-modal');
      const modalId = type === 'resume' ? 'experience-modal' : 'contacts-modal';
      const modal = document.getElementById(modalId);
      
      if (!modal) return;

      // Apply background and text colors matching main page current state
      const bodyBg = document.body.style.backgroundColor || '#0d0d0d';
      const bodyColor = document.body.style.color || '#ffffff';
      
      modal.style.backgroundColor = bodyBg;
      modal.style.color = bodyColor;

      // Apply active accent color dynamically on overlays load
      const activeAccent = document.documentElement.style.getPropertyValue('--accent-color') || '#66ffde';
      document.documentElement.style.setProperty('--accent-color', activeAccent);

      // Propagate dark-text theme class if active
      const isHeaderDarkText = document.querySelector('.site-header')?.classList.contains('theme-dark-text');
      if (isHeaderDarkText) {
        modal.classList.add('theme-dark-text');
      } else {
        modal.classList.remove('theme-dark-text');
      }

      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Reset scroll position of inner content viewport to 0 when opening details
      const scrollArea = modal.querySelector('.modal-content');
      if (scrollArea) {
        scrollArea.scrollTop = 0;
      }
    });
  });

  const closeModals = () => {
    document.querySelectorAll('.info-overlay-modal').forEach(modal => {
      modal.classList.remove('active');
    });
    document.body.style.overflow = '';
  };

  document.querySelectorAll('.info-modal-close').forEach(btn => {
    btn.addEventListener('click', closeModals);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModals();
    }
  });
}

// 8. Project Details Modal Setup
function setupModal() {
  const modal = document.getElementById('project-modal');
  const closeBtn = document.getElementById('modal-close-btn');

  if (!modal || !closeBtn) return;

  const closeModal = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    const videos = modal.querySelectorAll('video');
    videos.forEach(v => v.pause());
  };

  closeBtn.addEventListener('click', closeModal);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) {
      closeModal();
    }
  });
}

// Render dynamic project blocks in modal (Swiping full screen overlay inheriting project styles)
function openProjectModal(project) {
  const modal = document.getElementById('project-modal');
  if (!modal) return;

  const activeIdx = allProjects.findIndex(p => p.id === project.id);
  const theme = PROJECT_THEMES[project.category] || THEME_CYCLE[activeIdx % THEME_CYCLE.length];

  // Inherit active project style properties (Background, text colors, and font configurations)
  modal.style.backgroundColor = theme.bgHex;
  modal.style.color = theme.isDark ? '#ffffff' : '#0d0d0d';
  
  modal.className = `modal-overlay active ${theme.fontClass}`;
  if (theme.isDark) {
    modal.classList.remove('theme-dark-text');
  } else {
    modal.classList.add('theme-dark-text');
  }

  // Update dynamic accent color globally to match project modal content exactly
  document.documentElement.style.setProperty('--accent-color', theme.accentHex);

  const modalContent = modal.querySelector('.modal-content');
  if (modalContent) {
    modalContent.scrollTop = 0;
  }

  const bodyContainer = document.getElementById('modal-project-body');
  bodyContainer.innerHTML = '';

  project.blocks.forEach(block => {
    const blockEl = document.createElement('div');
    
    switch (block.type) {
      case 'text':
        blockEl.className = 'block-text';
        blockEl.innerHTML = parseMarkdown(block.value);
        break;

      case 'image':
        blockEl.className = 'block-image';
        blockEl.innerHTML = `
          <img src="${block.url}" alt="${block.caption || 'Изображение'}" loading="lazy">
          ${block.caption ? `<div class="block-caption">${block.caption}</div>` : ''}
        `;
        break;

      case 'video':
        blockEl.className = 'block-video';
        blockEl.innerHTML = `
          <video src="${block.url}" controls playsinline preload="metadata"></video>
          ${block.caption ? `<div class="block-caption">${block.caption}</div>` : ''}
        `;
        break;

      case 'pdf':
        blockEl.className = 'block-pdf fit-width';
        blockEl.innerHTML = `<div class="pdf-loading" style="padding: 40px; text-align: center; color: var(--text-muted); font-size: 0.95rem;">Загрузка страниц документа...</div>`;
        renderPdfPages(block.url, blockEl, block.caption);
        break;

      case 'carousel':
        blockEl.className = 'block-carousel-sticky-wrapper';
        blockEl.innerHTML = `
          <div class="carousel-sticky-container">
            ${block.title ? `<h4 class="carousel-sticky-title">${block.title}</h4>` : ''}
            <div class="carousel-horizontal-track">
              ${block.urls.map(url => `
                <div class="carousel-horizontal-item hoverable">
                  <img src="${url}" alt="Слайд" loading="lazy">
                </div>
              `).join('')}
            </div>
          </div>
        `;
        break;
    }

    bodyContainer.appendChild(blockEl);
  });

  // Setup scroll-driven horizontal animations for sticky carousels inside modal content viewport
  if (modalContent) {
    modalContent.addEventListener('scroll', () => {
      const wrappers = modalContent.querySelectorAll('.block-carousel-sticky-wrapper');
      wrappers.forEach(wrapper => {
        const stickyContainer = wrapper.querySelector('.carousel-sticky-container');
        const track = wrapper.querySelector('.carousel-horizontal-track');
        if (!stickyContainer || !track) return;
        
        const wrapperTop = wrapper.offsetTop;
        const wrapperHeight = wrapper.offsetHeight;
        const containerHeight = modalContent.clientHeight;
        const scrollTop = modalContent.scrollTop;
        
        // Sticky offset of 60px is subtracted from triggers matching CSS top: 60px rule
        const startScroll = wrapperTop - 60;
        const endScroll = wrapperTop + (wrapperHeight - containerHeight) - 60;
        
        if (scrollTop >= startScroll && scrollTop <= endScroll) {
          const progress = (scrollTop - startScroll) / (endScroll - startScroll);
          const maxTranslate = track.scrollWidth - modalContent.clientWidth;
          track.style.transform = `translateX(${-progress * maxTranslate}px)`;
        } else if (scrollTop < startScroll) {
          track.style.transform = 'translateX(0px)';
        } else {
          const maxTranslate = track.scrollWidth - modalContent.clientWidth;
          track.style.transform = `translateX(${-maxTranslate}px)`;
        }
      });
    });
  }

  document.body.style.overflow = 'hidden';
}

// Markdown-to-HTML helper for case description text formatting
function parseMarkdown(text) {
  if (!text) return '';
  
  let html = text;
  
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="hoverable" target="_blank" style="color: var(--accent-color); text-decoration: underline; font-weight: 500;">$1</a>');
  
  const parts = html.split(/\n\n+/);
  const parsedParts = parts.map(p => {
    const trimmed = p.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('<h') || trimmed.startsWith('<a') || trimmed.startsWith('<div')) {
      return trimmed;
    }
    return `<p>${trimmed.replace(/\n/g, '<br>')} </p>`;
  });
  
  return parsedParts.join('');
}

// Render PDF pages inside Modal via PDF.js stacked canvases
async function renderPdfPages(pdfUrl, container, caption) {
  try {
    container.className = 'block-pdf fit-width';
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    
    container.innerHTML = '';
    
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.display = 'block';
      
      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      
      await page.render(renderContext).promise;
      container.appendChild(canvas);
    }

    if (caption) {
      const captionEl = document.createElement('div');
      captionEl.className = 'block-caption';
      captionEl.textContent = caption;
      container.appendChild(captionEl);
    }
  } catch (err) {
    console.error('Error rendering PDF pages:', err);
    container.innerHTML = `
      <div style="padding: 40px; text-align: center; color: #ff5c5c; font-size: 0.95rem;">
        Не удалось отрендерить PDF-файл. <a href="${pdfUrl}" target="_blank" style="color: var(--accent-color); text-decoration: underline;">Скачать документ напрямую</a>.
      </div>
    `;
  }
}
