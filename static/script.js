document.addEventListener('DOMContentLoaded', () => {
    // Global state object
    let appData = {};
    let selectedScriptId = null;
    let selectedSentenceId = null;

    const DOM = {
        scriptsList: document.getElementById('scripts-list'),
        addScriptBtn: document.getElementById('add-script-btn'),
        newScriptName: document.getElementById('new-script-name'),
        
        currentScriptTitle: document.getElementById('current-script-title'),
        sentencesList: document.getElementById('sentences-list'),
        addSentenceContainer: document.getElementById('add-sentence-container'),
        addSentenceBtn: document.getElementById('add-sentence-btn'),
        newSentenceText: document.getElementById('new-sentence-text'),

        storyboardDetails: document.getElementById('storyboard-details'),
        currentSentenceText: document.getElementById('current-sentence-text'),
        mainImageContainer: document.getElementById('main-image-container'),
        mainImage: document.getElementById('main-image'),
        thumbnailsContainer: document.getElementById('thumbnails-container'),
        uploadContainer: document.getElementById('upload-container'),
        imageUploadInput: document.getElementById('image-upload-input'),
    };

    // --- API Helper ---
    async function apiRequest(endpoint, method = 'GET', body = null) {
        const options = { method };
        if (body) {
            if (!(body instanceof FormData)) {
                options.headers = { 'Content-Type': 'application/json' };
                options.body = JSON.stringify(body);
            } else {
                options.body = body;
            }
        }
        const response = await fetch(endpoint, options);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Server request failed');
        }
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.indexOf("application/json") !== -1) {
            return response.json();
        }
    }

    // --- Edit-in-place Functionality ---
    function makeEditable(element, type, id, originalText) {
        const textSpan = element.querySelector('span');
        textSpan.style.display = 'none'; // Hide original text

        const input = document.createElement(type === 'script' ? 'input' : 'textarea');
        input.type = 'text';
        input.value = originalText;
        input.className = 'edit-input';
        
        element.prepend(input);
        input.focus();
        input.select();

        const saveChanges = async () => {
            const newText = input.value.trim();
            if (newText && newText !== originalText) {
                try {
                    const endpoint = type === 'script' ? `/api/scripts/${id}` : `/api/sentences/${id}`;
                    const payload = type === 'script' ? { name: newText } : { text: newText };
                    await apiRequest(endpoint, 'PUT', payload);
                    await loadInitialData();
                } catch (error) {
                    console.error(`Failed to update ${type}:`, error);
                    // On failure, restore original view without reloading
                    textSpan.style.display = 'inline';
                    element.removeChild(input);
                }
            } else {
                // No change, just restore view
                textSpan.style.display = 'inline';
                if(input.parentNode) element.removeChild(input);
            }
        };

        input.addEventListener('blur', saveChanges);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (type === 'script' || !e.shiftKey)) {
                e.preventDefault();
                input.blur(); // Trigger save
            } else if (e.key === 'Escape') {
                input.removeEventListener('blur', saveChanges); // Prevent saving on escape
                input.blur();
            }
        });
    }

    // --- Render Functions ---
    function renderScripts() {
        DOM.scriptsList.innerHTML = '';
        Object.values(appData).forEach(script => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.id = script.id;
            if (script.id === selectedScriptId) item.classList.add('active');

            const textSpan = document.createElement('span');
            textSpan.textContent = script.name;
            item.appendChild(textSpan);

            item.addEventListener('dblclick', () => makeEditable(item, 'script', script.id, script.name));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除脚本 "${script.name}" 吗？`)) deleteScript(script.id);
            };
            item.appendChild(deleteBtn);
            
            item.addEventListener('click', (e) => {
                // Prevent selection if double-clicking or clicking the delete button
                if (e.target.tagName !== 'BUTTON') selectScript(script.id);
            });
            DOM.scriptsList.appendChild(item);
        });
    }

    function renderSentences() {
        DOM.sentencesList.innerHTML = '';
        if (!selectedScriptId || !appData[selectedScriptId]) {
            DOM.currentScriptTitle.textContent = '请先选择一个脚本';
            DOM.addSentenceContainer.style.display = 'none';
            return;
        }

        const script = appData[selectedScriptId];
        DOM.currentScriptTitle.textContent = `脚本: ${script.name}`;
        DOM.addSentenceContainer.style.display = 'block';

        const sentences = script.sentences || {};
        Object.values(sentences).forEach(sentence => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.id = sentence.id;
            if (sentence.id === selectedSentenceId) item.classList.add('active');

            const textSpan = document.createElement('span');
            textSpan.textContent = sentence.text;
            item.appendChild(textSpan);

            item.addEventListener('dblclick', () => makeEditable(item, 'sentence', sentence.id, sentence.text));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除这个句子吗？`)) deleteSentence(sentence.id);
            };
            item.appendChild(deleteBtn);
            
            item.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON') selectSentence(sentence.id);
            });
            DOM.sentencesList.appendChild(item);
        });
    }

    function renderStoryboard() {
        DOM.thumbnailsContainer.innerHTML = '';
        DOM.mainImage.src = '';
        DOM.mainImage.style.display = 'none';
        DOM.mainImage.alt = "主图预览区";

        if (!selectedScriptId || !selectedSentenceId || !appData[selectedScriptId]?.sentences?.[selectedSentenceId]) {
            DOM.storyboardDetails.style.display = 'none';
            DOM.uploadContainer.style.display = 'none';
            return;
        }
        
        const sentence = appData[selectedScriptId].sentences[selectedSentenceId];
        DOM.storyboardDetails.style.display = 'block';
        DOM.uploadContainer.style.display = 'block';
        DOM.currentSentenceText.textContent = sentence.text;

        const images = sentence.images || {};
        if (Object.keys(images).length > 0 && sentence.main_image_id) {
             const mainImageInfo = images[sentence.main_image_id];
             if(mainImageInfo) {
                DOM.mainImage.src = `/uploads/${mainImageInfo.filename}`;
                DOM.mainImage.style.display = 'block';
             }
        }

        Object.values(images).forEach(image => {
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'thumbnail';
            thumbDiv.dataset.id = image.id;
            if (image.id === sentence.main_image_id) thumbDiv.classList.add('is-main');

            const img = document.createElement('img');
            img.src = `/uploads/${image.filename}`;
            thumbDiv.appendChild(img);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn delete-img-btn';
            deleteBtn.onclick = (e) => { e.stopPropagation(); deleteImage(image.id); };
            thumbDiv.appendChild(deleteBtn);

            thumbDiv.onclick = () => setMainImage(image.id);
            DOM.thumbnailsContainer.appendChild(thumbDiv);
        });
    }
    
    // --- Action Functions ---
    async function addScript() {
        const name = DOM.newScriptName.value.trim();
        if (!name) return;
        const newScript = await apiRequest('/api/scripts', 'POST', { name });
        selectedScriptId = newScript.id;
        selectedSentenceId = null;
        DOM.newScriptName.value = '';
        await loadInitialData();
    }
    async function deleteScript(scriptId) {
        await apiRequest(`/api/scripts/${scriptId}`, 'DELETE');
        if (selectedScriptId === scriptId) {
            selectedScriptId = null;
            selectedSentenceId = null;
        }
        await loadInitialData();
    }
    function selectScript(scriptId) {
        if (selectedScriptId === scriptId) return;
        selectedScriptId = scriptId;
        selectedSentenceId = null;
        renderAll();
    }
    async function addSentence() {
        const text = DOM.newSentenceText.value.trim();
        if (!text || !selectedScriptId) return;
        const newSentence = await apiRequest('/api/sentences', 'POST', { script_id: selectedScriptId, text });
        selectedSentenceId = newSentence.id;
        DOM.newSentenceText.value = '';
        await loadInitialData();
    }
    async function deleteSentence(sentenceId) {
        await apiRequest(`/api/sentences/${sentenceId}`, 'DELETE');
        if (selectedSentenceId === sentenceId) {
            selectedSentenceId = null;
        }
        await loadInitialData();
    }
    function selectSentence(sentenceId) {
        if (selectedSentenceId === sentenceId) return;
        selectedSentenceId = sentenceId;
        renderAll();
    }
    async function handleImageUpload(event) {
        const files = event.target.files;
        if (!files.length || !selectedSentenceId) return;
        const formData = new FormData();
        for (const file of files) formData.append('files', file);
        await apiRequest(`/api/images/${selectedSentenceId}`, 'POST', formData);
        await loadInitialData();
        event.target.value = null;
    }
    async function deleteImage(imageId) {
        await apiRequest(`/api/images/${imageId}`, 'DELETE');
        await loadInitialData();
    }
    async function setMainImage(imageId) {
        const sentence = appData[selectedScriptId].sentences[selectedSentenceId];
        if (sentence.main_image_id === imageId) return;
        await apiRequest(`/api/images/set_main/${imageId}`, 'POST');
        await loadInitialData();
    }
    
    function renderAll() {
        renderScripts();
        renderSentences();
        renderStoryboard();
    }
    
    async function loadInitialData() {
        try {
            appData = await apiRequest('/api/data');
            renderAll();
        } catch (error) {
            console.error('Failed to load initial data:', error);
            alert('无法从服务器加载数据，请确保服务器正在运行！');
        }
    }

    // --- Event Listeners ---
    DOM.addScriptBtn.addEventListener('click', addScript);
    DOM.addSentenceBtn.addEventListener('click', addSentence);
    DOM.imageUploadInput.addEventListener('change', handleImageUpload);

    // --- Initial Load ---
    loadInitialData();

    // --- For Debugging ---
    window.debug = {
        DOM,
        appData,
        addScript,
        addSentence,
        loadInitialData
    };
});