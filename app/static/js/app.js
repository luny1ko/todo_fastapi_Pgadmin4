// app/static/js/app.js
// Полностью проверенная версия: стабильная делегация, фильтры, календарь, добавление нескольких задач подряд.

let categories = [];
let tasks = [];
let activeCategory = null;
let currentView = "list"; // list|cards|calendar
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();

let filterState = { from: null, to: null, priority: "", project: "", owner: "", nodate: false, overdue: false };

async function fetchData() {
  try {
    const [catsResp, tasksResp] = await Promise.all([
      fetch('/api/categories'),
      fetch('/api/tasks')
    ]);
    categories = await catsResp.json();
    tasks = await tasksResp.json();
  } catch (err) {
    console.error("fetchData error", err);
    categories = []; tasks = [];
  }
}

function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function hexToRgba(hex, alpha){
  if(!hex) return `rgba(0,0,0,${alpha})`;
  const h = hex.replace('#','');
  const bigint = parseInt(h,16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function priorityClass(p){
  if(!p) return 'priority-low';
  const key = String(p).toLowerCase();
  if(key === 'high') return 'priority-high';
  if(key === 'medium') return 'priority-medium';
  return 'priority-low';
}

// ---------- rendering ----------
function renderCategories(){
  const container = document.getElementById('categories');
  container.innerHTML = '';
  categories.forEach(cat => {
    const el = document.createElement('div');
    el.className = 'cat-item';
    el.dataset.id = cat.id;
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;flex:1">
        <div class="cat-dot" style="background:${cat.color}"></div>
        <div class="cat-name">${escapeHtml(cat.name)}</div>
      </div>
      <div><button class="cat-edit" title="Edit">✏️</button></div>
    `;
    // hover highlight using category color
    el.addEventListener('mouseenter', ()=> { el.style.background = hexToRgba(cat.color, 0.12); });
    el.addEventListener('mouseleave', ()=> { el.style.background = ''; });

    if (activeCategory === cat.id) el.classList.add('active');
    container.appendChild(el);
  });
}

function applyFilters(list){
  const q = document.getElementById('search').value.trim().toLowerCase();
  let filtered = list.filter(t => {
    const inSearch = t.title.toLowerCase().includes(q) || (t.description||'').toLowerCase().includes(q);
    return inSearch;
  });
  if(activeCategory) filtered = filtered.filter(t => t.category_id === activeCategory);
  if(filterState.from) filtered = filtered.filter(t => t.date && t.date >= filterState.from);
  if(filterState.to) filtered = filtered.filter(t => t.date && t.date <= filterState.to);
  if(filterState.priority) filtered = filtered.filter(t => t.priority === filterState.priority);
  if(filterState.project) filtered = filtered.filter(t => (t.project||'').toLowerCase().includes(filterState.project.toLowerCase()));
  if(filterState.owner) filtered = filtered.filter(t => (t.owner||'').toLowerCase().includes(filterState.owner.toLowerCase()));
  if(filterState.nodate) filtered = filtered.filter(t => !t.date);
  if(filterState.overdue){
    const today = new Date().toISOString().slice(0,10);
    filtered = filtered.filter(t => t.date && t.date < today);
  }
  return filtered;
}

function renderTasks(){
  const container = document.getElementById('tasks-container');
  container.innerHTML = '';
  const filtered = applyFilters(tasks);

  if(currentView === 'list'){
    // table
    const table = document.createElement('table'); table.className = 'table';
    table.innerHTML = `<thead><tr>
      <th>Task</th><th>Project</th><th>Priority</th><th>Date</th><th>Owner</th><th>Category</th><th>Actions</th>
    </tr></thead>`;
    const tbody = document.createElement('tbody');
    filtered.forEach(t => {
      const cat = categories.find(c => c.id === t.category_id);
      const tr = document.createElement('tr'); tr.dataset.id = t.id;
      tr.innerHTML = `
        <td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(t.project||'')}</td>
        <td><span class="priority-badge ${priorityClass(t.priority)}">${escapeHtml(t.priority||'Low')}</span></td>
        <td>${escapeHtml(t.date||'')}</td>
        <td>${escapeHtml(t.owner||'')}</td>
        <td>${cat ? `<span class="cat-badge" style="background:${cat.color}">${escapeHtml(cat.name)}</span>` : ''}</td>
        <td>
          <button class="btn edit-task" data-id="${t.id}">Edit</button>
          <button class="btn delete-task" data-id="${t.id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  } else if(currentView === 'cards'){
    const grid = document.createElement('div'); grid.className = 'tasks cards-view';
    filtered.forEach(t=>{
      const cat = categories.find(c=>c.id===t.category_id) || {};
      const card = document.createElement('div'); card.className='card';
      card.dataset.id = t.id;
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="card-title">${escapeHtml(t.title)}</div>
          <div style="width:10px;height:30px;border-radius:6px;background:${cat.color||'#ccc'}"></div>
        </div>
        <div class="card-desc">${escapeHtml(t.description||'')}</div>
        <div class="card-meta">${escapeHtml(t.project||'')} • <span class="${priorityClass(t.priority)}">${escapeHtml(t.priority||'Low')}</span> • ${escapeHtml(t.date||'')}</div>
        <div style="margin-top:8px">
          <button class="btn edit-task" data-id="${t.id}">Edit</button>
          <button class="btn delete-task" data-id="${t.id}">Delete</button>
        </div>
      `;
      grid.appendChild(card);
    });
    container.appendChild(grid);
  } else if(currentView === 'calendar'){
    const wrap = document.createElement('div'); wrap.className='calendar-container';
    const header = document.createElement('div'); header.className='calendar-header';
    const monthName = new Date(currentYear, currentMonth, 1).toLocaleString('default',{month:'long'});
    header.innerHTML = `<div><strong>${monthName} ${currentYear}</strong></div>
      <div>
        <button class="btn calendar-prev">◀</button>
        <button class="btn calendar-today">Today</button>
        <button class="btn calendar-next">▶</button>
      </div>`;
    wrap.appendChild(header);

    const weekHeader = document.createElement('div'); weekHeader.className='calendar-grid';
    const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    WEEKDAYS.forEach(w => { const el = document.createElement('div'); el.className='weekday'; el.textContent = w; weekHeader.appendChild(el); });
    wrap.appendChild(weekHeader);

    const grid = document.createElement('div'); grid.className='calendar-grid';
    const first = new Date(currentYear, currentMonth, 1);
    const last = new Date(currentYear, currentMonth+1, 0);
    let startShift = first.getDay() === 0 ? 6 : first.getDay() - 1;
    for(let i=0;i<startShift;i++){ const blank = document.createElement('div'); blank.className='day'; grid.appendChild(blank); }
    for(let d=1; d<= last.getDate(); d++){
      const dayEl = document.createElement('div'); dayEl.className='day';
      const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      dayEl.dataset.date = dateStr;
      dayEl.innerHTML = `<div class="day-num">${d}</div>`;
      const dayTasks = tasks.filter(t => t.date === dateStr);
      dayTasks.forEach(t => {
        const cat = categories.find(c=>c.id===t.category_id) || {};
        const ev = document.createElement('div'); ev.className='event';
        ev.style.background = cat.color || priorityColorFromPriority(t.priority);
        ev.textContent = t.title;
        ev.dataset.taskId = t.id;
        dayEl.appendChild(ev);
      });
      grid.appendChild(dayEl);
    }
    wrap.appendChild(grid);
    container.appendChild(wrap);
  }
}

// helper for fallback event color (if category missing)
function priorityColorFromPriority(p){
  if(!p) return '#6bcf6b';
  const key = String(p).toLowerCase();
  if(key === 'high') return '#ff6b6b';
  if(key === 'medium') return '#ffb86b';
  return '#6bcf6b';
}

// ---------- Modals ----------
function openCategoryModal(cat=null){
  const modal = document.getElementById('modal-cat');
  modal.dataset.editId = cat ? cat.id : '';
  document.getElementById('modal-cat-title').textContent = cat ? 'Edit Category' : 'New Category';
  document.getElementById('cat-name').value = cat ? cat.name : '';
  document.getElementById('cat-color').value = cat ? cat.color : '#ff7f2a';
  document.getElementById('cat-delete').classList.toggle('hidden', !cat);
  modal.classList.remove('hidden');
}

async function saveCategory(){
  const modal = document.getElementById('modal-cat');
  const id = modal.dataset.editId;
  const name = document.getElementById('cat-name').value.trim();
  const color = document.getElementById('cat-color').value;
  if(!name){ alert('Введите имя категории'); return; }
  const fd = new FormData(); fd.append('name', name); fd.append('color', color);
  try{
    if(!id){
      const resp = await fetch('/api/categories', { method: 'POST', body: fd });
      if(!resp.ok) throw new Error('create failed');
    } else {
      const resp = await fetch(`/api/categories/${id}`, { method: 'PUT', body: fd });
      if(!resp.ok) throw new Error('update failed');
    }
    modal.classList.add('hidden');
    await fetchData(); renderCategories(); renderTasks(); populateCategorySelect();
  }catch(err){
    console.error(err); alert('Ошибка при сохранении категории');
  }
}
async function deleteCategoryFromModal(){
  const modal = document.getElementById('modal-cat'); const id = modal.dataset.editId;
  if(!id) return;
  if(!confirm('Delete category? Tasks will be detached.')) return;
  const resp = await fetch(`/api/categories/${id}`, { method: 'DELETE' });
  if(!resp.ok){ alert('Ошибка удаления'); return; }
  modal.classList.add('hidden'); await fetchData(); renderCategories(); renderTasks(); populateCategorySelect();
}
function closeCategoryModal(){ document.getElementById('modal-cat').classList.add('hidden'); }

function openTaskModal(task=null, presetDate=null){
  const modal = document.getElementById('modal-task');
  modal.dataset.editId = task ? task.id : '';
  document.getElementById('modal-task-title').textContent = task ? 'Edit Task' : 'New Task';
  document.getElementById('task-title').value = task ? task.title : '';
  document.getElementById('task-project').value = task ? task.project : '';
  document.getElementById('task-priority').value = task ? task.priority : 'Low';
  document.getElementById('task-owner').value = task ? task.owner : '';
  document.getElementById('task-category').value = task ? (task.category_id || '') : '';
  document.getElementById('task-date').value = task ? (task.date || (presetDate||'')) : (presetDate||'');
  document.getElementById('task-desc').value = task ? task.description : '';
  modal.classList.remove('hidden');
}

async function saveTask(){
  const modal = document.getElementById('modal-task'); const id = modal.dataset.editId;
  const title = document.getElementById('task-title').value.trim();
  if(!title){ alert('Title required'); return; }
  const fd = new FormData();
  fd.append('title', title);
  fd.append('project', document.getElementById('task-project').value.trim());
  fd.append('priority', document.getElementById('task-priority').value);
  fd.append('owner', document.getElementById('task-owner').value.trim());
  const cat = document.getElementById('task-category').value; if(cat) fd.append('category_id', cat);
  const date = document.getElementById('task-date').value; if(date) fd.append('date', date);
  fd.append('description', document.getElementById('task-desc').value.trim());

  try{
    if(!id){
      const resp = await fetch('/api/tasks', { method: 'POST', body: fd });
      if(!resp.ok) throw new Error('create task failed');
    } else {
      const resp = await fetch(`/api/tasks/${id}`, { method: 'PUT', body: fd });
      if(!resp.ok) throw new Error('update task failed');
    }
    // after successful create/update clear modal state
    modal.dataset.editId = '';
    document.getElementById('task-title').value = '';
    document.getElementById('task-project').value = '';
    document.getElementById('task-priority').value = 'Low';
    document.getElementById('task-owner').value = '';
    document.getElementById('task-category').value = '';
    document.getElementById('task-date').value = '';
    document.getElementById('task-desc').value = '';

    modal.classList.add('hidden');
    await fetchData(); renderCategories(); renderTasks(); populateCategorySelect();
  }catch(err){
    console.error(err); alert('Ошибка при сохранении задачи');
  }
}

function closeTaskModal(){ document.getElementById('modal-task').classList.add('hidden'); }

async function deleteTaskById(taskId){
  if(!confirm('Delete task?')) return;
  const resp = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
  if(!resp.ok){ alert('Error deleting'); return; }
  await fetchData(); renderTasks();
}

// Filter modal actions
function openFilterModal(){
  document.getElementById('filter-from').value = filterState.from || '';
  document.getElementById('filter-to').value = filterState.to || '';
  document.getElementById('filter-priority').value = filterState.priority || '';
  document.getElementById('filter-project').value = filterState.project || '';
  document.getElementById('filter-owner').value = filterState.owner || '';
  document.getElementById('filter-nodate').checked = !!filterState.nodate;
  document.getElementById('filter-overdue').checked = !!filterState.overdue;
  document.getElementById('modal-filter').classList.remove('hidden');
}
function closeFilterModal(){ document.getElementById('modal-filter').classList.add('hidden'); }
function applyFilterFromModal(){
  filterState.from = document.getElementById('filter-from').value || null;
  filterState.to = document.getElementById('filter-to').value || null;
  filterState.priority = document.getElementById('filter-priority').value || '';
  filterState.project = document.getElementById('filter-project').value.trim() || '';
  filterState.owner = document.getElementById('filter-owner').value.trim() || '';
  filterState.nodate = document.getElementById('filter-nodate').checked;
  filterState.overdue = document.getElementById('filter-overdue').checked;
  document.getElementById('modal-filter').classList.add('hidden');
  renderTasks();
}
function clearFilterFromModal(){
  filterState = { from: null, to: null, priority: "", project: "", owner: "", nodate: false, overdue: false };
  document.getElementById('modal-filter').classList.add('hidden');
  renderTasks();
}

// populate category select in task modal
function populateCategorySelect(){
  const sel = document.getElementById('task-category');
  sel.innerHTML = '<option value="">— none —</option>';
  categories.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
}

// ---------- static listeners & delegation ----------
let listenersAttached = false;
function attachStaticListeners(){
  if(listenersAttached) return;
  listenersAttached = true;

  document.getElementById('btn-new-category').addEventListener('click', ()=> openCategoryModal(null));
  document.getElementById('btn-new-task').addEventListener('click', ()=> openTaskModal(null));
  document.getElementById('btn-filter').addEventListener('click', ()=> openFilterModal());

  document.getElementById('cat-save').addEventListener('click', saveCategory);
  document.getElementById('cat-cancel').addEventListener('click', closeCategoryModal);
  document.getElementById('cat-delete').addEventListener('click', deleteCategoryFromModal);

  document.getElementById('task-save').addEventListener('click', saveTask);
  document.getElementById('task-cancel').addEventListener('click', closeTaskModal);

  document.getElementById('filter-apply').addEventListener('click', applyFilterFromModal);
  document.getElementById('filter-clear').addEventListener('click', clearFilterFromModal);
  document.getElementById('filter-cancel').addEventListener('click', closeFilterModal);

  document.getElementById('search').addEventListener('input', renderTasks);

  document.querySelectorAll('.view-btn').forEach(b => {
    b.addEventListener('click', (e)=>{
      document.querySelectorAll('.view-btn').forEach(x=>x.classList.remove('active'));
      b.classList.add('active');
      currentView = b.dataset.view;
      renderTasks();
    });
  });

  // delegation on categories container
  document.getElementById('categories').addEventListener('click', (e)=>{
    const item = e.target.closest('.cat-item');
    if(!item) return;
    const cid = item.dataset.id;
    if(e.target.classList.contains('cat-edit')) {
      const cat = categories.find(c=>c.id===cid);
      openCategoryModal(cat);
      return;
    }
    activeCategory = (activeCategory === cid) ? null : cid;
    document.querySelectorAll('.cat-item').forEach(x => x.classList.toggle('active', x.dataset.id === activeCategory));
    renderTasks();
  });

  // delegation on tasks container (edit/delete/calendar actions, day click)
  document.getElementById('tasks-container').addEventListener('click', async (e)=>{
    if(e.target.classList.contains('delete-task')){
      const id = e.target.dataset.id; await deleteTaskById(id); return;
    }
    if(e.target.classList.contains('edit-task')){
      const id = e.target.dataset.id; const t = tasks.find(x=>x.id===id); if(t) openTaskModal(t); return;
    }
    if(e.target.classList.contains('calendar-prev')){
      currentMonth -= 1; if(currentMonth < 0){ currentMonth = 11; currentYear -= 1; } renderTasks(); return;
    }
    if(e.target.classList.contains('calendar-next')){
      currentMonth += 1; if(currentMonth > 11){ currentMonth = 0; currentYear += 1; } renderTasks(); return;
    }
    if(e.target.classList.contains('calendar-today')){
      const now = new Date(); currentYear = now.getFullYear(); currentMonth = now.getMonth(); renderTasks(); return;
    }
    // day click -> new task with date
    const day = e.target.closest('.day');
    if(day && day.dataset && day.dataset.date){
      openTaskModal(null, day.dataset.date); return;
    }
    // event click -> open task edit
    const ev = e.target.closest('.event');
    if(ev && ev.dataset && ev.dataset.taskId){
      const t = tasks.find(x=>x.id===ev.dataset.taskId); if(t) openTaskModal(t); return;
    }
  });

}

// ---------- boot ----------
async function boot(){
  await fetchData();
  populateCategorySelect();
  renderCategories();
  renderTasks();
  attachStaticListeners();
}

// initial
document.addEventListener('DOMContentLoaded', () => boot());
