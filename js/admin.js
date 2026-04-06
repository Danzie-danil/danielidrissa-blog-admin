
/**
 * Daniel Idrissa Standalone Admin Dashboard
 * Logic for Git-based content management via GitHub API
 */

let CONFIG = null;
let AUTH = {
  token: localStorage.getItem('gh_token'),
  owner: localStorage.getItem('gh_owner') || 'Danzie-danil',
  repo: localStorage.getItem('gh_repo') || 'danielidrissa-blog'
};

// Initial Setup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('./config.json');
    CONFIG = await response.json();
    initApp();
  } catch (err) {
    showToast('Failed to load admin configuration', 'error');
  }
});

function initApp() {
  checkAuth();
  setupEventListeners();
  if (AUTH.token) {
    loadSection('dashboard');
  }
}

// Authentication
function checkAuth() {
  const overlay = document.getElementById('login-overlay');
  if (!AUTH.token || !AUTH.owner || !AUTH.repo) {
    overlay.style.display = 'flex';
  } else {
    overlay.style.display = 'none';
  }
}

function setupEventListeners() {
  // Login
  document.getElementById('login-btn').addEventListener('click', () => {
    let token = document.getElementById('github-token').value.trim();
    let owner = document.getElementById('github-owner').value.trim();
    let repo = document.getElementById('github-repo').value.trim();

    // Sanitize: If a full URL is pasted, extract the relevant parts
    if (owner.includes('github.com/')) {
      const parts = owner.split('github.com/')[1].split('/');
      owner = parts[0];
      if (parts[1] && !repo) repo = parts[1];
    }
    if (repo.includes('/')) {
      const parts = repo.split('/');
      if (parts.length > 1) {
        repo = parts[parts.length - 1] || parts[parts.length - 2];
      }
    }

    if (token && owner && repo) {
      localStorage.setItem('gh_token', token);
      localStorage.setItem('gh_owner', owner);
      localStorage.setItem('gh_repo', repo);
      AUTH = { token, owner, repo };
      checkAuth();
      loadSection('dashboard');
      showToast('Logged in successfully', 'success');
    } else {
      showToast('Please fill in all fields (Owner and Repo name only)', 'error');
    }
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', () => {
    localStorage.removeItem('gh_token');
    localStorage.removeItem('gh_owner');
    localStorage.removeItem('gh_repo');
    location.reload();
  });

  // Sidebar Navigation
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const section = item.dataset.section;
      document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('is-active'));
      item.classList.add('is-active');
      loadSection(section);
    });
  });
}

// Section Loading
async function loadSection(section) {
  const content = document.getElementById('admin-content');
  content.innerHTML = '<div class="text-center py-xl">Loading...</div>';

  if (section === 'dashboard') {
    content.innerHTML = `
      <div class="admin-header">
        <h1 class="page-title">Welcome, Daniel</h1>
      </div>
      <div class="content-card p-lg text-center">
        <h3 class="mb-sm">Ready to Share?</h3>
        <p class="mb-lg">Create new sermons, audio, or media directly from here.</p>
        <button class="btn btn-primary" onclick="document.querySelector('[data-section=sermons]').click()">Manage Sermons</button>
      </div>
    `;
    return;
  }

  const collection = CONFIG.collections[section];
  if (!collection) return;

  try {
    const files = await githubFetch(`contents/${collection.path}`);
    renderListing(section, collection, files);
  } catch (err) {
    content.innerHTML = `
      <div class="admin-header">
        <h1 class="page-title">${collection.name}</h1>
        <button class="btn btn-primary" onclick="window.createNewItem('${section}')">+ New ${section.slice(0,-1)}</button>
      </div>
      <p class="text-center py-xl">No content found or error fetching contents.</p>
    `;
  }
}

function renderListing(id, collection, files) {
  const content = document.getElementById('admin-content');
  let html = `
    <div class="admin-header">
      <h1 class="page-title">${collection.name}</h1>
      <button class="btn btn-primary" onclick="window.createNewItem('${id}')">+ New Entry</button>
    </div>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Name</th>
          <th style="text-align:right">Actions</th>
        </tr>
      </thead>
      <tbody>
  `;

  files.forEach(file => {
    if (file.type === 'file' && (file.name.endsWith('.md') || file.name.endsWith('.html'))) {
      html += `
        <tr>
          <td><strong>${file.name}</strong></td>
          <td style="text-align:right">
            <button class="text-accent font-bold" onclick="window.editItem('${id}', '${file.path}')">Edit</button>
            <button class="text-error font-bold ml-md" onclick="window.deleteItem('${id}', '${file.path}', '${file.sha}')">Delete</button>
          </td>
        </tr>
      `;
    }
  });

  html += '</tbody></table>';
  content.innerHTML = html;
}

// Item CRUD
window.createNewItem = (sectionId) => renderEditor(sectionId);

window.editItem = async (sectionId, path) => {
  const file = await githubFetch(`contents/${path}`);
  const content = decodeURIComponent(escape(atob(file.content)));
  
  const parts = content.split('---');
  let data = {};
  let body = '';
  if (parts.length >= 3) {
    data = jsyaml.load(parts[1]);
    body = parts.slice(2).join('---').trim();
  }

  renderEditor(sectionId, { path, sha: file.sha, data, body });
};

function renderEditor(sectionId, existing = null) {
  const collection = CONFIG.collections[sectionId];
  const content = document.getElementById('admin-content');
  
  let html = `
    <div class="admin-header">
      <h1 class="page-title">${existing ? 'Edit' : 'New'} ${collection.singular || collection.name}</h1>
      <div>
        <button class="btn btn-secondary" onclick="loadSection('${sectionId}')">Cancel</button>
        <button class="btn btn-primary" id="save-btn">Save Content</button>
      </div>
    </div>
    <div class="content-card p-xl">
      <form id="editor-form">
  `;

  collection.fields.forEach(field => {
    const value = existing ? (field.isBody ? existing.body : (existing.data[field.name] || '')) : '';
    html += `<div class="admin-form-group"><label class="admin-label">${field.label}</label>`;
    if (field.type === 'text' || field.type === 'markdown') {
      html += `<textarea id="field-${field.name}" class="admin-textarea">${value}</textarea>`;
    } else if (field.type === 'file') {
      html += `<input type="file" id="field-${field.name}" class="admin-input" accept="${field.accept || ''}">`;
    } else {
      html += `<input type="${field.type}" id="field-${field.name}" class="admin-input" value="${value}">`;
    }
    html += `</div>`;
  });

  html += `</form></div>`;
  content.innerHTML = html;
  document.getElementById('save-btn').onclick = () => saveItem(sectionId, existing);
}

async function saveItem(sectionId, existing) {
  const collection = CONFIG.collections[sectionId];
  const formData = {};
  let body = '';
  
  for (const field of collection.fields) {
    const input = document.getElementById(`field-${field.name}`);
    if (field.isBody) {
      body = input.value;
    } else if (field.type === 'file' && input.files[0]) {
      const file = input.files[0];
      const assetPath = `src/assets/uploads/${file.name}`;
      showToast(`Uploading ${file.name}...`, 'info');
      await uploadFile(assetPath, file);
      formData[field.name] = `/assets/uploads/${file.name}`;
    } else {
      formData[field.name] = input.value;
    }
  }
  
  // Automatically add date if missing from the form but intended for the frontmatter
  if (!formData.date && !collection.fields.find(f => f.name === 'date')) {
    formData.date = new Date().toISOString().split('T')[0];
  }

  const frontmatter = jsyaml.dump(formData);
  const fullContent = `---\n${frontmatter}---\n\n${body}`;
  const filename = existing ? existing.path.split('/').pop() : `${slugify(formData.title || 'post')}.md`;
  const path = `${collection.path}/${filename}`;

  try {
    showToast('Saving to GitHub...', 'success');
    await githubPut(path, fullContent, existing ? existing.sha : null);
    showToast('Published successfully!', 'success');
    loadSection(sectionId);
  } catch (err) {
    showToast('Error saving: ' + err.message, 'error');
  }
}

async function uploadFile(path, file) {
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      const content = reader.result.split(',')[1];
      try {
        await githubPut(path, content, null, true);
        resolve();
      } catch (err) { reject(err); }
    };
    reader.readAsDataURL(file);
  });
}

// GitHub API
async function githubFetch(endpoint) {
  const res = await fetch(`https://api.github.com/repos/${AUTH.owner}/${AUTH.repo}/${endpoint}`, {
    headers: { 'Authorization': `token ${AUTH.token}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
}

async function githubPut(path, content, sha = null, isBinary = false) {
  const body = {
    message: `Admin update: ${path}`,
    content: isBinary ? content : btoa(unescape(encodeURIComponent(content))),
    branch: 'main'
  };
  if (sha) body.sha = sha;

  const res = await fetch(`https://api.github.com/repos/${AUTH.owner}/${AUTH.repo}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Authorization': `token ${AUTH.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
}

async function githubDelete(path, sha) {
  const body = { message: `Admin delete: ${path}`, sha, branch: 'main' };
  const res = await fetch(`https://api.github.com/repos/${AUTH.owner}/${AUTH.repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { 'Authorization': `token ${AUTH.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(await res.text());
}

function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function slugify(text) {
  return text.toString().toLowerCase().trim()
    .replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-');
}
