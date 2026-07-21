import CONFIG from './config.js';

document.addEventListener('DOMContentLoaded', () => {
  // Check if we should use Supabase Cloud Mode
  const useSupabase = CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY;
  const supabase = useSupabase && window.supabase ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY) : null;

  // Global Admin State
  let projects = [];
  let currentProject = null; // null means creating new, otherwise holds project object
  let projectBlocks = []; // holds the array of blocks currently being edited
  let currentCoverUrl = '';

  // DOM Elements
  const listScreen = document.getElementById('projects-list-screen');
  const editorScreen = document.getElementById('project-editor-screen');
  const projectsGrid = document.getElementById('projects-list-grid');
  const blocksStack = document.getElementById('blocks-stack');
  const authOverlay = document.getElementById('auth-overlay');
  const authForm = document.getElementById('auth-form');
  
  const btnCreateNew = document.getElementById('btn-create-new');
  const btnCancel = document.getElementById('btn-cancel');
  const btnSaveProject = document.getElementById('btn-save-project');
  const btnSaveProjectBottom = document.getElementById('btn-save-project-bottom');
  const btnDeleteProject = document.getElementById('btn-delete-project');
  
  const projectForm = document.getElementById('project-metadata-form');
  const idField = document.getElementById('project-id-field');
  const titleField = document.getElementById('project-title-field');
  const categoryField = document.getElementById('project-category-field');
  const clientField = document.getElementById('project-client-field');
  const dateField = document.getElementById('project-date-field');
  const descField = document.getElementById('project-desc-field');

  const coverDropzone = document.getElementById('cover-dropzone');
  const coverFileInput = document.getElementById('cover-file-input');
  const coverDropzoneText = document.getElementById('cover-dropzone-text');
  const coverPreviewWrapper = document.getElementById('cover-preview-wrapper');
  const coverImgPreview = document.getElementById('cover-img-preview');
  const btnRemoveCover = document.getElementById('btn-remove-cover');

  // Initialize Auth & App
  initAdmin();

  async function initAdmin() {
    setupEventListeners();

    if (useSupabase && supabase) {
      console.log('Admin running in Cloud Mode (Supabase)');
      
      // Add Logout button in the header nav
      const headerNav = document.querySelector('.nav-actions');
      if (headerNav) {
        const logoutBtn = document.createElement('button');
        logoutBtn.className = 'btn-admin hoverable';
        logoutBtn.style.marginLeft = '10px';
        logoutBtn.textContent = 'Выйти';
        logoutBtn.addEventListener('click', async () => {
          await supabase.auth.signOut();
          checkSession();
        });
        headerNav.appendChild(logoutBtn);
      }

      checkSession();
    } else {
      console.log('Admin running in Local Mode (Express Node.js)');
      if (authOverlay) authOverlay.style.display = 'none';
      fetchProjects();
    }
  }

  // --- Auth logic for Supabase Cloud ---
  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      if (authOverlay) authOverlay.style.display = 'flex';
      projectsGrid.innerHTML = '';
    } else {
      if (authOverlay) authOverlay.style.display = 'none';
      fetchProjects();
    }
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value;
      const password = document.getElementById('auth-password').value;

      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        checkSession();
      } catch (err) {
        alert('Ошибка авторизации: ' + err.message);
      }
    });
  }

  // --- REST / Database operations ---
  async function fetchProjects() {
    try {
      if (useSupabase && supabase) {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        projects = (data || []).map(p => ({
          ...p,
          coverImage: p.coverImage || p.coverimage
        }));
      } else {
        const res = await fetch('/api/projects');
        if (!res.ok) throw new Error();
        projects = await res.json();
      }
      renderProjectsList();
    } catch (err) {
      projectsGrid.innerHTML = '<div style="color: #ef4444; padding: 20px; grid-column: 1/-1; text-align: center;">Не удалось загрузить проекты. Проверьте запуск сервера или базы данных.</div>';
    }
  }

  const CATEGORY_MAP = {
    '3d': '3D Графика',
    'motion': 'Моушн дизайн',
    'graphic': 'Графический дизайн',
    'presentation': 'Дизайн презентаций',
    'print': 'Верстка полиграфии'
  };

  function renderProjectsList() {
    if (projects.length === 0) {
      projectsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
          Проектов пока нет. Нажмите кнопку выше, чтобы создать свой первый проект.
        </div>
      `;
      return;
    }

    projectsGrid.innerHTML = '';
    projects.forEach(proj => {
      const card = document.createElement('div');
      card.className = 'admin-project-card';
      
      let coverHtml = '';
      if (proj.coverImage) {
        coverHtml = `<img src="${proj.coverImage}" alt="${proj.title}">`;
      } else {
        coverHtml = `
          <div class="placeholder-visual" style="font-size: 0.8rem; text-transform: uppercase;">
            ${CATEGORY_MAP[proj.category] || 'Проект'}
          </div>
        `;
      }

      card.innerHTML = `
        <div class="img-wrapper">
          ${coverHtml}
        </div>
        <div class="info">
          <div>
            <span style="font-size: 0.75rem; color: var(--accent-secondary); text-transform: uppercase; font-weight: 600;">${CATEGORY_MAP[proj.category] || proj.category}</span>
            <h3 style="font-size: 1.15rem; margin-top: 5px; line-height: 1.3;">${proj.title}</h3>
          </div>
          <div class="actions">
            <button class="btn-card-edit" data-id="${proj.id}">Редактировать</button>
            <button class="btn-card-delete" data-id="${proj.id}">Удалить</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-card-edit').addEventListener('click', () => openEditor(proj));
      card.querySelector('.btn-card-delete').addEventListener('click', () => deleteProject(proj.id));

      projectsGrid.appendChild(card);
    });
  }

  function setupEventListeners() {
    btnCreateNew.addEventListener('click', () => openEditor(null));
    btnCancel.addEventListener('click', closeEditor);
    
    btnSaveProject.addEventListener('click', saveProject);
    btnSaveProjectBottom.addEventListener('click', saveProject);
    btnDeleteProject.addEventListener('click', () => {
      if (currentProject) deleteProject(currentProject.id);
    });

    document.querySelectorAll('.btn-add-block').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-type');
        addBlock(type);
      });
    });

    coverDropzone.addEventListener('click', (e) => {
      if (e.target !== btnRemoveCover && !coverPreviewWrapper.contains(e.target)) {
        coverFileInput.click();
      }
    });

    coverFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        uploadFile(e.target.files[0], 'cover');
      }
    });

    btnRemoveCover.addEventListener('click', (e) => {
      e.stopPropagation();
      removeCover();
    });

    ['dragenter', 'dragover'].forEach(eventName => {
      coverDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        coverDropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      coverDropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        coverDropzone.classList.remove('dragover');
      }, false);
    });

    coverDropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0 && files[0].type.startsWith('image/')) {
        uploadFile(files[0], 'cover');
      }
    }, false);
  }

  // --- Cover Handling ---
  function removeCover() {
    currentCoverUrl = '';
    coverImgPreview.src = '';
    coverPreviewWrapper.style.display = 'none';
    coverDropzoneText.style.display = 'block';
    coverFileInput.value = '';
  }

  function showCover(url) {
    currentCoverUrl = url;
    coverImgPreview.src = url;
    coverPreviewWrapper.style.display = 'block';
    coverDropzoneText.style.display = 'none';
  }

  // --- Binary / Multipart Upload Helper (Local & Supabase support) ---
  async function uploadFile(file, context, blockIndex = null) {
    // Generate unique filename safely
    const ext = file.name.substring(file.name.lastIndexOf('.'));
    const cleanBase = file.name.replace(ext, '').replace(/[^a-zA-Z0-9А-Яа-я-_]/g, '_');
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e5)}${ext}`;
    const filePath = `uploads/${uniqueName}`;

    // Find progress element if inside a block
    let progressBarContainer = null;
    let progressBar = null;
    
    if (context === 'block' && blockIndex !== null) {
      const blockEl = document.querySelector(`.editor-block[data-index="${blockIndex}"]`);
      if (blockEl) {
        progressBarContainer = blockEl.querySelector('.upload-progress-container');
        progressBar = blockEl.querySelector('.upload-progress-bar');
      }
    }

    if (progressBarContainer && progressBar) {
      progressBarContainer.style.display = 'block';
      progressBar.style.width = '0%';
    }

    try {
      let finalUrl = '';
      
      if (useSupabase && supabase) {
        // Upload direct to Supabase Storage via XHR to keep progress tracking!
        const sessionData = await supabase.auth.getSession();
        const token = sessionData.data.session ? sessionData.data.session.access_token : '';
        
        const xhr = new XMLHttpRequest();
        const uploadUrl = `${CONFIG.SUPABASE_URL}/storage/v1/object/portfolio-media/${filePath}`;
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && progressBar) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = `${percent}%`;
          }
        });

        const uploadResponse = await new Promise((resolve, reject) => {
          xhr.open('POST', uploadUrl);
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          xhr.setRequestHeader('apikey', CONFIG.SUPABASE_ANON_KEY);
          // Set appropriate content type for file
          xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error(`Supabase upload failed: ${xhr.status} ${xhr.statusText}`));
            }
          };
          xhr.onerror = () => reject(new Error('Network error during Supabase upload'));
          xhr.send(file);
        });

        // Get public web link from Storage
        const publicUrlData = supabase.storage.from('portfolio-media').getPublicUrl(filePath);
        finalUrl = publicUrlData.data.publicUrl;

      } else {
        // Upload to Local Node.js Multer Endpoint
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable && progressBar) {
            const percent = Math.round((e.loaded / e.total) * 100);
            progressBar.style.width = `${percent}%`;
          }
        });

        const response = await new Promise((resolve, reject) => {
          xhr.open('POST', '/api/upload');
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error('Upload failed'));
            }
          };
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(formData);
        });

        finalUrl = response.url;
      }

      if (progressBarContainer) {
        progressBarContainer.style.display = 'none';
      }

      if (context === 'cover') {
        showCover(finalUrl);
      } else if (context === 'block' && blockIndex !== null) {
        projectBlocks[blockIndex].url = finalUrl;
        projectBlocks[blockIndex].fileName = file.name;
        renderBlocks();
      }
    } catch (err) {
      alert('Ошибка при загрузке файла: ' + err.message);
      if (progressBarContainer) {
        progressBarContainer.style.display = 'none';
      }
    }
  }

  // --- Editor Open/Close ---
  function openEditor(project) {
    currentProject = project;
    projectForm.reset();
    
    if (project) {
      document.getElementById('editor-screen-title').textContent = `Редактирование: ${project.title}`;
      idField.value = project.id;
      titleField.value = project.title;
      categoryField.value = project.category;
      clientField.value = project.client || '';
      dateField.value = project.date || '';
      descField.value = project.description || '';
      
      if (project.coverImage) {
        showCover(project.coverImage);
      } else {
        removeCover();
      }

      projectBlocks = JSON.parse(JSON.stringify(project.blocks || []));
      btnDeleteProject.style.display = 'inline-block';
    } else {
      document.getElementById('editor-screen-title').textContent = 'Создание нового проекта';
      idField.value = '';
      removeCover();
      projectBlocks = [];
      btnDeleteProject.style.display = 'none';
    }

    renderBlocks();
    
    listScreen.style.display = 'none';
    editorScreen.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeEditor() {
    listScreen.style.display = 'block';
    editorScreen.style.display = 'none';
    currentProject = null;
    projectBlocks = [];
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // --- Dynamic Block Builder Operations ---
  function addBlock(type) {
    const newBlock = { type: type };
    if (type === 'text') {
      newBlock.value = '';
    } else {
      newBlock.url = '';
      newBlock.caption = '';
      newBlock.fileName = '';
    }
    projectBlocks.push(newBlock);
    renderBlocks();
  }

  function deleteBlock(index) {
    projectBlocks.splice(index, 1);
    renderBlocks();
  }

  function moveBlock(index, direction) {
    if (direction === 'up' && index > 0) {
      const temp = projectBlocks[index];
      projectBlocks[index] = projectBlocks[index - 1];
      projectBlocks[index - 1] = temp;
    } else if (direction === 'down' && index < projectBlocks.length - 1) {
      const temp = projectBlocks[index];
      projectBlocks[index] = projectBlocks[index + 1];
      projectBlocks[index + 1] = temp;
    }
    renderBlocks();
  }

  function updateBlockText(index, value) {
    projectBlocks[index].value = value;
  }

  function updateBlockCaption(index, value) {
    projectBlocks[index].caption = value;
  }

  function renderBlocks() {
    blocksStack.innerHTML = '';
    
    if (projectBlocks.length === 0) {
      blocksStack.innerHTML = `
        <div style="text-align: center; border: 2px dashed var(--border-color); border-radius: 16px; padding: 40px; color: var(--text-muted);">
          Кейс пуст. Добавьте контентные блоки (текст, фото, видео или PDF) с помощью панели ниже.
        </div>
      `;
      return;
    }

    projectBlocks.forEach((block, index) => {
      const blockEl = document.createElement('div');
      blockEl.className = 'editor-block';
      blockEl.dataset.index = index;

      const headerHtml = `
        <div class="block-header">
          <span class="block-badge ${block.type}">${block.type}</span>
          <div class="block-controls">
            <button type="button" class="btn-control hoverable" onclick="window.adminMoveBlock(${index}, 'up')" ${index === 0 ? 'disabled style="opacity:0.3;"' : ''}>↑</button>
            <button type="button" class="btn-control hoverable" onclick="window.adminMoveBlock(${index}, 'down')" ${index === projectBlocks.length - 1 ? 'disabled style="opacity:0.3;"' : ''}>↓</button>
            <button type="button" class="btn-control delete hoverable" onclick="window.adminDeleteBlock(${index})">×</button>
          </div>
        </div>
      `;

      let contentHtml = '';

      if (block.type === 'text') {
        contentHtml = `
          <textarea class="block-textarea" placeholder="Введите текст... (Поддерживается разметка: # - Заголовок 1, ## - Заголовок 2, [Текст](Ссылка) - Ссылка, пустая строка - Абзац)" oninput="window.adminUpdateText(${index}, this.value)">${block.value || ''}</textarea>
        `;
      } else {
        let filePreviewHtml = '';
        if (block.url) {
          if (block.type === 'image') {
            filePreviewHtml = `<div class="block-file-preview"><img src="${block.url}"><button type="button" class="btn-remove-file" onclick="window.adminClearBlockFile(${index})">×</button></div>`;
          } else if (block.type === 'video') {
            filePreviewHtml = `<div class="block-file-preview"><video src="${block.url}" controls></video><button type="button" class="btn-remove-file" onclick="window.adminClearBlockFile(${index})">×</button></div>`;
          } else if (block.type === 'pdf') {
            filePreviewHtml = `
              <div class="block-file-preview" style="max-width: 100%;">
                <div class="pdf-preview-box">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span>Документ PDF: <a href="${block.url}" target="_blank" style="color: var(--accent-secondary); text-decoration: underline;">${block.fileName || 'Просмотреть'}</a></span>
                </div>
                <button type="button" class="btn-remove-file" onclick="window.adminClearBlockFile(${index})">×</button>
              </div>`;
          }
        } else {
          const acceptTypes = {
            'image': 'image/*',
            'video': 'video/mp4,video/webm',
            'pdf': 'application/pdf'
          };
          filePreviewHtml = `
            <div class="upload-dropzone block-dropzone hoverable" onclick="document.getElementById('block-file-input-${index}').click()">
              <input type="file" id="block-file-input-${index}" accept="${acceptTypes[block.type]}" style="display: none;" onchange="window.adminHandleBlockUpload(this, ${index})">
              <div>
                <p>Нажмите для загрузки файла (${block.type})</p>
                <span class="file-limits">Максимальный размер: 50MB</span>
              </div>
            </div>
            <div class="upload-progress-container">
              <div class="upload-progress-bar"></div>
            </div>
          `;
        }

        contentHtml = `
          ${filePreviewHtml}
          <input type="text" class="block-caption-input" placeholder="Подпись к блоку (необязательно)" value="${block.caption || ''}" oninput="window.adminUpdateCaption(${index}, this.value)">
        `;
      }

      blockEl.innerHTML = headerHtml + contentHtml;
      blocksStack.appendChild(blockEl);
    });
  }

  // Expose methods globally for inline onclick triggers
  window.adminMoveBlock = (index, direction) => moveBlock(index, direction);
  window.adminDeleteBlock = (index) => {
    if (confirm('Вы уверены, что хотите удалить этот блок?')) deleteBlock(index);
  };
  window.adminUpdateText = (index, val) => updateBlockText(index, val);
  window.adminUpdateCaption = (index, val) => updateBlockCaption(index, val);
  window.adminClearBlockFile = (index) => {
    projectBlocks[index].url = '';
    projectBlocks[index].fileName = '';
    renderBlocks();
  };
  window.adminHandleBlockUpload = (input, index) => {
    if (input.files.length > 0) {
      uploadFile(input.files[0], 'block', index);
    }
  };

  // --- Save / Delete DB actions ---
  async function saveProject() {
    const title = titleField.value.trim();
    const category = categoryField.value;
    
    if (!title) {
      alert('Пожалуйста, введите название проекта.');
      titleField.focus();
      return;
    }

    const projectData = {
      title: title,
      category: category,
      client: clientField.value.trim(),
      date: dateField.value,
      description: descField.value.trim(),
      coverImage: currentCoverUrl,
      coverimage: currentCoverUrl, // support lowercase column in Supabase PostgreSQL
      blocks: projectBlocks
    };

    if (currentProject && currentProject.id) {
      projectData.id = currentProject.id;
    } else {
      projectData.id = `project-${Date.now()}`;
    }

    try {
      if (useSupabase && supabase) {
        // Upsert into Supabase projects table
        const { error } = await supabase
          .from('projects')
          .upsert(projectData);
        if (error) throw error;
      } else {
        // Save to local Express backend API
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(projectData)
        });
        if (!res.ok) throw new Error();
      }

      alert('Проект успешно сохранен!');
      closeEditor();
      fetchProjects();
    } catch (err) {
      alert('Не удалось сохранить проект: ' + err.message);
    }
  }

  async function deleteProject(id) {
    if (!confirm('Вы действительно хотите безвозвратно удалить этот проект и все его медиафайлы?')) {
      return;
    }

    try {
      if (useSupabase && supabase) {
        // Delete from Supabase projects table
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', id);
        if (error) throw error;
      } else {
        // Delete from local server
        const res = await fetch(`/api/projects/${id}`, {
          method: 'DELETE'
        });
        if (!res.ok) throw new Error();
      }

      alert('Проект успешно удален.');
      if (currentProject && currentProject.id === id) {
        closeEditor();
      }
      fetchProjects();
    } catch (err) {
      alert('Ошибка при удалении проекта: ' + err.message);
    }
  }
});
