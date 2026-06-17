// ── State ─────────────────────────────────────────────────────────────
let currentLang   = localStorage.getItem('cg_lang') || 'hi'; // default Hindi
let selectedFile  = null;
let ttsUtterance  = null;
let isSpeaking    = false;
let lastResult    = null;

// ── DOM refs ──────────────────────────────────────────────────────────
const dropZone    = document.getElementById('dropZone');
const imageUpload = document.getElementById('imageUpload');
const browseBtn   = document.getElementById('browseBtn');
const preview     = document.getElementById('preview');
const previewImg  = document.getElementById('previewImg');
const analyzeBtn  = document.getElementById('analyzeBtn');
const newImageBtn = document.getElementById('newImageBtn');
const resultsDiv  = document.getElementById('results');

// ── Language setup ────────────────────────────────────────────────────
function t(key) { return (TRANSLATIONS[currentLang] || TRANSLATIONS['hi'])[key] || key; }

function buildLangSelector() {
    const wrapper = document.getElementById('langSelectorWrapper');
    let html = `<div class="lang-dropdown">
        <button class="lang-btn" id="langToggleBtn">
            <span id="langFlag">${TRANSLATIONS[currentLang].flag}</span>
            <span id="langName">${TRANSLATIONS[currentLang].name}</span>
            <i class="fas fa-chevron-down ms-1" style="font-size:.7rem"></i>
        </button>
        <div class="lang-menu" id="langMenu">`;
    Object.entries(TRANSLATIONS).forEach(([code, tr]) => {
        const active = code === currentLang ? 'active' : '';
        html += `<div class="lang-option ${active}" data-lang="${code}">${tr.flag} ${tr.name}</div>`;
    });
    html += `</div></div>`;
    wrapper.innerHTML = html;

    document.getElementById('langToggleBtn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('langMenu').classList.toggle('open');
    });
    document.addEventListener('click', () => {
        const m = document.getElementById('langMenu');
        if (m) m.classList.remove('open');
    });
    document.querySelectorAll('.lang-option').forEach(el => {
        el.addEventListener('click', () => {
            currentLang = el.dataset.lang;
            localStorage.setItem('cg_lang', currentLang);
            applyTranslations();
            buildLangSelector();
            if (lastResult) renderResult(lastResult); // re-render result in new lang
        });
    });
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
}

// ── Navbar scroll ─────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
    document.querySelector('.navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ── Scroll reveal ─────────────────────────────────────────────────────
const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ── File picking ──────────────────────────────────────────────────────
browseBtn.addEventListener('click', () => imageUpload.click());
dropZone.addEventListener('click', e => { if (e.target !== browseBtn) imageUpload.click(); });
imageUpload.addEventListener('change', e => { if (e.target.files[0]) loadFile(e.target.files[0]); });

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) loadFile(f);
    else showToast(t('error_no_image'), 'warning');
});

function loadFile(file) {
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = e => {
        previewImg.src = e.target.result;
        dropZone.classList.add('d-none');
        preview.classList.remove('d-none');
        resultsDiv.classList.add('d-none');
        resultsDiv.innerHTML = '';
        newImageBtn.classList.add('d-none');
        stopAudio();
        lastResult = null;
    };
    reader.readAsDataURL(file);
}

newImageBtn.addEventListener('click', () => {
    selectedFile = null; imageUpload.value = ''; previewImg.src = '';
    preview.classList.add('d-none');
    dropZone.classList.remove('d-none');
    resultsDiv.classList.add('d-none');
    resultsDiv.innerHTML = '';
    newImageBtn.classList.add('d-none');
    stopAudio(); lastResult = null;
});

// ── Analyze ───────────────────────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
    if (!selectedFile) { showToast(t('error_no_image'), 'warning'); return; }
    stopAudio();

    resultsDiv.classList.remove('d-none');
    resultsDiv.innerHTML = `
        <div class="loading-block">
            <div class="spinner-border" role="status"></div>
            <p class="mt-3 fw-semibold">${t('analyzing')}</p>
            <p class="text-muted small">${t('analyzing_sub')}</p>
        </div>`;

    analyzeBtn.disabled = true;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>...';

    const fd = new FormData();
    fd.append('image', selectedFile);
    fd.append('lang', currentLang);

    try {
        const resp = await fetch('/analyze', { method: 'POST', body: fd });
        const data = await resp.json();
        if (data.error) renderError(data.error);
        else {
            lastResult = data.result;
            renderResult(data.result);
            newImageBtn.classList.remove('d-none');
        }

    } catch {
        renderError('Network connection failed. Is the Flask server running? Please start it using "python app.py".');
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = `<i class="fas fa-search me-2"></i>${t('analyze_btn')}`;
    }
});

// ── Render result ─────────────────────────────────────────────────────
function renderResult(r) {
    const severityMap = {
        none:     { label: '✅ ' + (r.severity === 'none' ? 'Healthy' : ''), cls: 'severity-none' },
        moderate: { label: '⚠️ Moderate', cls: 'severity-moderate' },
        severe:   { label: '🔴 Severe',   cls: 'severity-severe' },
        critical: { label: '🚨 Critical', cls: 'severity-critical' },
    };
    const sev = severityMap[r.severity] || { label: r.severity, cls: 'severity-moderate' };
    const sourceLbl = r.source === 'gemini' ? '🤖 Gemini AI' : '🤗 Hugging Face';

    const causesHTML    = (r.causes    || []).map(c => `<li>${c}</li>`).join('');
    const treatmentHTML = (r.treatment || []).map(t => `<li>${t}</li>`).join('');
    const medicineHTML  = (r.medicine  || []).map(m => `<li>${m}</li>`).join('');
    const preventHTML   = (r.prevention|| []).map(p => `<li>${p}</li>`).join('');

    resultsDiv.innerHTML = `
    <div class="result-wrapper">
        <div class="result-header">
            <i class="fas fa-stethoscope fa-lg text-success"></i>
            <h4 class="mb-0">${t('res_complete')}</h4>
            <span class="badge bg-light text-dark border ms-auto" style="font-size:.72rem">${sourceLbl}</span>
        </div>

        <div class="disease-card severity-${r.severity}">
            <div class="disease-card-header">
                <div>
                    <div class="plant-tag">🌿 ${r.plant_name || 'Unknown Plant'}</div>
                    <h5 class="disease-name mt-1">${r.disease_name || 'Unknown'}</h5>
                </div>
                <div class="d-flex flex-column align-items-end gap-2">
                    <span class="severity-badge ${sev.cls}">${sev.label}</span>
                    <button class="audio-btn" id="audioBtn" onclick="toggleAudio()">
                        ${t('listen_btn')}
                    </button>
                </div>
            </div>

            <div class="disease-card-body">
                <div class="confidence-block">
                    <div class="d-flex justify-content-between mb-1">
                        <span class="confidence-label"><i class="fas fa-chart-bar me-1"></i>${t('res_confidence')}</span>
                        <span class="confidence-value">${r.confidence}%</span>
                    </div>
                    <div class="confidence-bar">
                        <div class="confidence-level" style="width:0%" data-width="${r.confidence}"></div>
                    </div>
                </div>

                <div class="info-section">
                    <div class="info-section-title"><i class="fas fa-virus"></i> ${t('res_causes')}</div>
                    <ul class="causes-list">${causesHTML}</ul>
                </div>

                <div class="info-section">
                    <div class="info-section-title"><i class="fas fa-prescription-bottle-alt"></i> ${t('res_treatment')}</div>
                    <ol class="treatment-list">${treatmentHTML}</ol>
                </div>

                ${medicineHTML ? `
                <div class="info-section">
                    <div class="info-section-title"><i class="fas fa-pills"></i> ${t('res_medicine')}</div>
                    <ul class="causes-list">${medicineHTML}</ul>
                </div>` : ''}

                ${preventHTML ? `
                <div class="info-section mb-0">
                    <div class="info-section-title"><i class="fas fa-shield-alt"></i> ${t('res_prevention')}</div>
                    <ul class="causes-list">${preventHTML}</ul>
                </div>` : ''}
            </div>
        </div>
    </div>`;

    // Animate confidence bar
    requestAnimationFrame(() => {
        document.querySelectorAll('.confidence-level').forEach(bar => {
            bar.style.width = bar.dataset.width + '%';
        });
    });
}

// ── Text-to-Speech ─────────────────────────────────────────────
function buildAudioChunks(r) {
    const chunks = [];
    chunks.push(`${r.plant_name}.`);
    chunks.push(`${r.disease_name}.`);
    
    if (r.causes?.length) {
        chunks.push(`${t('res_causes')}.`);
        r.causes.forEach(c => chunks.push(c));
    }
    if (r.treatment?.length) {
        chunks.push(`${t('res_treatment')}.`);
        r.treatment.forEach(tr => chunks.push(tr));
    }
    if (r.medicine?.length) {
        chunks.push(`${t('res_medicine')}.`);
        r.medicine.forEach(m => chunks.push(m));
    }
    if (r.prevention?.length) {
        chunks.push(`${t('res_prevention')}.`);
        r.prevention.forEach(p => chunks.push(p));
    }
    return chunks;
}

let ttsQueue = [];

function toggleAudio() {
    if (isSpeaking) { stopAudio(); return; }
    if (!lastResult) return;

    ttsQueue = buildAudioChunks(lastResult);
    const langCode = LANG_CODES[currentLang] || 'hi-IN';
    
    isSpeaking = true;
    const btn = document.getElementById('audioBtn');
    if (btn) { btn.innerHTML = t('stop_btn'); btn.classList.add('playing'); }

    playNextChunk(langCode);
}

function playNextChunk(langCode) {
    if (ttsQueue.length === 0 || !isSpeaking) {
        stopAudio();
        return;
    }

    const text = ttsQueue.shift();
    ttsUtterance = new SpeechSynthesisUtterance(text);
    ttsUtterance.lang  = langCode;
    ttsUtterance.rate  = 0.9;
    ttsUtterance.pitch = 1;

    ttsUtterance.onend = () => {
        if (isSpeaking) playNextChunk(langCode);
    };

    ttsUtterance.onerror = (e) => {
        console.log("TTS Error:", e);
        if (isSpeaking) playNextChunk(langCode);
    };

    window.speechSynthesis.speak(ttsUtterance);
}

function stopAudio() {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    ttsQueue = [];
    const btn = document.getElementById('audioBtn');
    if (btn) { btn.innerHTML = t('listen_btn'); btn.classList.remove('playing'); }
}

// ── Error & Toast ─────────────────────────────────────────────────────
function renderError(msg) {
    resultsDiv.innerHTML = `
        <div class="error-block">
            <p class="mb-1 fw-bold"><i class="fas fa-exclamation-circle"></i> Error</p>
            <p class="mb-0">${msg}</p>
        </div>`;
}

function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:2rem;right:2rem;z-index:9999;
        background:${type==='warning'?'#fff3cd':'#d1ecf1'};
        border:1px solid ${type==='warning'?'#ffc107':'#bee5eb'};
        color:${type==='warning'?'#856404':'#0c5460'};
        padding:.75rem 1.25rem;border-radius:12px;
        box-shadow:0 5px 20px rgba(0,0,0,.15);font-weight:500;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ── Init ──────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    buildLangSelector();
    applyTranslations();
});