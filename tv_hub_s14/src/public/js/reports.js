const reportsList = document.querySelector('#reports-list');
const reportsStatus = document.querySelector('#reports-status');
const reportFormSection = document.querySelector('#report-form-section');
const reportForm = document.querySelector('#report-form');
const reportFormStatus = document.querySelector('#report-form-status');
const channelId = new URLSearchParams(location.search).get('channelId');

const reportReasons = {
  STREAM_DOES_NOT_LOAD: 'Stream does not load',
  WRONG_CHANNEL: 'Wrong channel',
  AUDIO_PROBLEM: 'Audio problem',
  VIDEO_PROBLEM: 'Video problem',
  OTHER: 'Other'
};
const reportStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED'];

async function loadUser() {
  const response = await fetch('/api/users/me');
  if (!response.ok) { location.href = '/login'; return false; }
  const user = await response.json();
  document.querySelector('#welcome').textContent = `Welcome, ${user.email}`;
  return true;
}

function formatReason(reason) {
  return reason.toLowerCase().split('_').map((word) => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function createElement(tag, properties = {}) {
  return Object.assign(document.createElement(tag), properties);
}

function createSelect(options, selectedValue) {
  const select = createElement('select', { required: true });
  for (const [value, label] of options) {
    select.append(createElement('option', { value, textContent: label, selected: value === selectedValue }));
  }
  return select;
}

// TODO 13 (Sección 3): la View envía PATCH con JSON para modificar el mismo Report.
async function updateReport(reportId, reason, description, status) {
  return fetch(`/api/reports/${reportId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      reason,
      description,
      status
    })
  });
}

// TODO 16 (Sección 4): la View invoca DELETE sobre el Report seleccionado.
async function deleteReport(reportId) {
  return fetch(`/api/reports/${reportId}`, {
    method: 'DELETE'
  });
}

function createEditForm(report, item) {
  const form = createElement('form', { className: 'report-edit-form' });
  const reasonSelect = createSelect(Object.entries(reportReasons), report.reason);
  const descriptionInput = createElement('textarea', { value: report.description, maxLength: 1000, required: true });
  const statusSelect = createSelect(reportStatuses.map((status) => [status, status]), report.status);
  const formStatus = createElement('p', { className: 'form-status' });
  const saveButton = createElement('button', { type: 'submit', textContent: 'Save changes' });
  const cancelButton = createElement('button', { type: 'button', className: 'report-button', textContent: 'Cancel' });

  form.append(
    createElement('label', { textContent: 'Reason' }),
    reasonSelect,
    createElement('label', { textContent: 'Description' }),
    descriptionInput,
    createElement('label', { textContent: 'Status' }),
    statusSelect,
    createElement('div', { className: 'report-actions' }),
    formStatus
  );
  form.querySelector('.report-actions').append(saveButton, cancelButton);

  cancelButton.addEventListener('click', () => item.replaceWith(createReportItem(report)));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formStatus.textContent = 'Saving…';
    const response = await updateReport(report._id, reasonSelect.value, descriptionInput.value, statusSelect.value);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      formStatus.textContent = payload.error?.message || 'Could not update the report.';
      return;
    }
    reportsStatus.textContent = 'Report updated.';
    await loadReports();
  });
  return form;
}

function createReportItem(report) {
  const item = createElement('article', { className: 'report-item' });
  item.dataset.reportId = report._id;
  const channel = createElement('h3', { textContent: report.channelId?.name || 'Channel unavailable' });
  const reason = createElement('p', { textContent: `Reason: ${formatReason(report.reason)}` });
  const description = createElement('p', { textContent: report.description });
  const status = createElement('p', { className: 'report-status', textContent: report.status });
  const created = createElement('p', { className: 'report-date', textContent: new Date(report.createdAt).toLocaleString() });
  item.append(channel, reason, description, status, created);

  // Sección 2: un Report puede tener varias evidencias, se muestra un enlace por cada URL.
  const evidenceUrls = report.evidenceUrls || [];
  if (evidenceUrls.length > 0) {
    const evidenceList = createElement('div', { className: 'report-evidence-list' });
    evidenceUrls.forEach((url, index) => {
      evidenceList.append(createElement('a', {
        href: url,
        target: '_blank',
        rel: 'noopener',
        textContent: evidenceUrls.length === 1 ? 'View evidence image' : `View evidence image ${index + 1}`
      }));
    });
    item.append(evidenceList);
  }

  const actions = createElement('div', { className: 'report-actions' });
  const editButton = createElement('button', { type: 'button', className: 'report-button', textContent: 'Edit' });
  const deleteButton = createElement('button', { type: 'button', className: 'report-button report-delete', textContent: 'Delete' });
  actions.append(editButton, deleteButton);
  item.append(actions);

  editButton.addEventListener('click', () => {
    const editing = createElement('article', { className: 'report-item' });
    editing.dataset.reportId = report._id;
    editing.append(createElement('h3', { textContent: `Edit report · ${report.channelId?.name || 'Channel unavailable'}` }));
    editing.append(createEditForm(report, editing));
    item.replaceWith(editing);
  });

  deleteButton.addEventListener('click', async () => {
    if (!confirm('Delete this report and its evidence images?')) return;
    const response = await deleteReport(report._id);
    if (!response.ok) {
      reportsStatus.textContent = 'Could not delete the report.';
      return;
    }
    await loadReports();
  });

  return item;
}

async function loadReports() {
  const response = await fetch('/api/reports');
  if (!response.ok) { reportsStatus.textContent = 'Could not load reports.'; return; }
  const { reports } = await response.json();
  reportsStatus.textContent = `${reports.length} report${reports.length === 1 ? '' : 's'}`;
  if (reports.length === 0) {
    reportsList.replaceChildren(createElement('p', { className: 'empty-state', textContent: 'You have not reported a channel yet.' }));
    return;
  }
  reportsList.replaceChildren(...reports.map(createReportItem));
}

async function submitReport(event) {
  event.preventDefault();
  const formData = new FormData();
  formData.append('channelId', channelId);
  formData.append('reason', document.querySelector('#report-reason').value);
  formData.append('description', document.querySelector('#report-description').value);

  // TODO v4.5 4: el nombre 'evidence' coincide con el campo esperado por Multer.
  // TODO 10 (Sección 2): se agregan todas las imágenes seleccionadas con el mismo nombre.
  const evidenceFiles =
    document.querySelector('#report-evidence').files;

  for (const file of evidenceFiles) {
    formData.append('evidence', file);
  }

  reportFormStatus.textContent = 'Submitting report…';
  // TODO v4.5 5: el FormData se envía como body; el navegador genera el boundary multipart.
  const response = await fetch('/api/reports', {
    method: 'POST',
    body: formData
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    reportFormStatus.textContent = payload.error?.message || 'Could not submit the report.';
    return;
  }

  reportForm.reset();
  reportFormStatus.textContent = 'Report saved.';
  await loadReports();
}

function configureReportForm() {
  if (!channelId) return;
  reportFormSection.hidden = false;
  document.querySelector('#report-channel-id').value = channelId;
  document.querySelector('#report-channel').textContent = 'Report the selected channel.';
  reportForm.addEventListener('submit', submitReport);
}

document.querySelector('#logout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.href = '/login'; });
async function start() { if (await loadUser()) { configureReportForm(); await loadReports(); } }
start();
