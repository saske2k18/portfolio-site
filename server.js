const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up directory paths
const WORKSPACE_DIR = __dirname;
const DATABASE_DIR = path.join(WORKSPACE_DIR, 'database');
const UPLOADS_DIR = path.join(WORKSPACE_DIR, 'uploads');
const PROJECTS_FILE = path.join(DATABASE_DIR, 'projects.json');
const PUBLIC_DIR = path.join(WORKSPACE_DIR, 'public');

// Ensure directories exist
if (!fs.existsSync(DATABASE_DIR)) {
  fs.mkdirSync(DATABASE_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(PUBLIC_DIR)) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
}

// Ensure projects database file exists
if (!fs.existsSync(PROJECTS_FILE)) {
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify([], null, 2));
}

// Multer config for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename preserving original extension
    const ext = path.extname(file.originalname);
    const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9А-Яа-я-_]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${basename}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR, { etag: false, maxAge: 0 }));
app.use('/uploads', express.static(UPLOADS_DIR));

// Scan workspace for root files and migrate them to database
function runMigration() {
  try {
    const files = fs.readdirSync(WORKSPACE_DIR);
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    let modified = false;

    files.forEach(file => {
      const filePath = path.join(WORKSPACE_DIR, file);
      const stat = fs.statSync(filePath);

      // Ignore folders and system files
      if (stat.isDirectory()) return;
      if (['server.js', 'package.json', 'package-lock.json', '.gitignore'].includes(file)) return;
      
      const ext = path.extname(file).toLowerCase();
      if (!['.pdf', '.pptx', '.jpg', '.jpeg', '.png', '.mp4'].includes(ext)) return;

      console.log(`[Migration] Found user file: ${file}. Migrating to uploads/ and projects...`);

      // Generate a unique file name in uploads
      const uniqueName = `${Date.now()}-${file.replace(/[^a-zA-Z0-9А-Яа-я._-]/g, '_')}`;
      const destPath = path.join(UPLOADS_DIR, uniqueName);

      // Copy file to uploads directory and delete original
      fs.copyFileSync(filePath, destPath);
      fs.unlinkSync(filePath);

      // Determine category and default layout blocks
      let category = 'graphic';
      let title = file.replace(ext, '').replace(/_/g, ' ');
      const blocks = [];

      if (ext === '.pdf') {
        if (file.toLowerCase().includes('презентация') || file.toLowerCase().includes('слайд') || file.toLowerCase().includes('locus') || file.toLowerCase().includes('локус')) {
          category = 'presentation'; // дизайн презентаций
        } else {
          category = 'print'; // верстка полиграфии
        }
        blocks.push({
          type: 'text',
          value: `### ${title}\n\nЭтот проект был загружен и автоматически импортирован из PDF-файла. Вы можете просмотреть документ целиком ниже.`
        });
        blocks.push({
          type: 'pdf',
          url: `/uploads/${uniqueName}`
        });
      } else if (ext === '.pptx') {
        category = 'presentation'; // дизайн презентаций
        blocks.push({
          type: 'text',
          value: `### ${title}\n\nПрезентация в формате PowerPoint (.pptx). Веб-версия файла доступна для скачивания ниже. Для полноценного просмотра на сайте рекомендуется сохранить файл в PDF и загрузить его в конструктор.`
        });
        blocks.push({
          type: 'text',
          value: `📥 [Скачать презентацию: ${file}](/uploads/${uniqueName})`
        });
      } else if (['.jpg', '.jpeg', '.png'].includes(ext)) {
        category = 'graphic';
        blocks.push({
          type: 'image',
          url: `/uploads/${uniqueName}`
        });
      } else if (ext === '.mp4') {
        category = 'motion';
        blocks.push({
          type: 'video',
          url: `/uploads/${uniqueName}`
        });
      }

      // Add project entry
      const newProject = {
        id: `imported-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        title: title,
        category: category,
        description: `Импортированная работа: ${file}`,
        coverImage: ext === '.pdf' || ext === '.pptx' ? '' : `/uploads/${uniqueName}`, // Default cover image for images
        client: 'Импорт',
        date: new Date().toISOString().substring(0, 7),
        blocks: blocks
      };

      projects.push(newProject);
      modified = true;
    });

    if (modified) {
      fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
      console.log(`[Migration] Database updated with newly imported files.`);
    }
  } catch (err) {
    console.error('[Migration Error]', err);
  }
}

// Run file migration at startup
runMigration();

// --- REST API ENDPOINTS ---

// Get all projects
app.get('/api/projects', (req, res) => {
  try {
    const data = fs.readFileSync(PROJECTS_FILE, 'utf8');
    const projects = JSON.parse(data);
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read projects database' });
  }
});

// Create or update project
app.post('/api/projects', (req, res) => {
  try {
    const project = req.body;
    if (!project.title || !project.category) {
      return res.status(400).json({ error: 'Title and category are required' });
    }

    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));

    if (project.id) {
      // Update existing project
      const index = projects.findIndex(p => p.id === project.id);
      if (index !== -1) {
        projects[index] = project;
      } else {
        projects.push(project);
      }
    } else {
      // Create new project
      project.id = `project-${Date.now()}-${Math.round(Math.random() * 1000)}`;
      projects.push(project);
    }

    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
    res.json(project);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
  try {
    const id = req.params.id;
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const index = projects.findIndex(p => p.id === id);

    if (index === -1) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const deletedProject = projects[index];
    
    // Optional: Delete associated files from uploads folder to save space
    deletedProject.blocks.forEach(block => {
      if (block.url && block.url.startsWith('/uploads/')) {
        const filePath = path.join(WORKSPACE_DIR, block.url);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }
      }
    });

    if (deletedProject.coverImage && deletedProject.coverImage.startsWith('/uploads/')) {
      const coverPath = path.join(WORKSPACE_DIR, deletedProject.coverImage);
      if (fs.existsSync(coverPath)) {
        try { fs.unlinkSync(coverPath); } catch (e) {}
      }
    }

    projects.splice(index, 1);
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

// Upload dynamic files (Images, Videos, PDFs)
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  // Return web-accessible URL
  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, originalName: req.file.originalname });
});

// Catch-all route to serve index.html (SPA fallback)
app.get('*', (req, res, next) => {
  // If requesting API paths or static resources, pass through
  if (req.url.startsWith('/api') || req.url.startsWith('/uploads') || req.url.includes('.')) {
    return next();
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
