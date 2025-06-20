document.addEventListener('DOMContentLoaded', () => {
    // State management
    let appData = {
        scripts: {}, // { scriptId: { name: 'scriptName', sentences: {} } }
        lastSelectedScriptId: null,
        lastSelectedSentenceId: null,
    };

    const DOM = {
        scriptsList: document.getElementById('scripts-list'),
        addScriptBtn: document.getElementById('add-script-btn'),
        newScriptName: document.getElementById('new-script-name'),
        
        currentScriptTitle: document.getElementById('current-script-title'),
        sentencesList: document.getElementById('sentences-list'),
        addSentenceContainer: document.getElementById('add-sentence-container'),
        addSentenceBtn: document.getElementById('add-sentence-btn'),
        newSentenceText: document.getElementById('new-sentence-text'),

        currentSentenceTitle: document.getElementById('current-sentence-title'),
        mainImageContainer: document.getElementById('main-image-container'),
        mainImage: document.getElementById('main-image'),
        thumbnailsContainer: document.getElementById('thumbnails-container'),
        uploadContainer: document.getElementById('upload-container'),
        imageUploadInput: document.getElementById('image-upload-input'),
    };

    // --- Data Persistence ---
    function saveData() {
        try {
            localStorage.setItem('storyboardApp', JSON.stringify(appData));
        } catch (e) {
            console.error("Error saving data to localStorage", e);
            alert("错误：无法保存数据！可能是存储空间已满。");
        }
    }

    function loadData() {
        const data = localStorage.getItem('storyboardApp');
        if (data) {
            appData = JSON.parse(data);
        }
    }

    // --- Core Logic ---
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // --- Render Functions ---
    function renderScripts() {
        DOM.scriptsList.innerHTML = '';
        Object.keys(appData.scripts).forEach(scriptId => {
            const script = appData.scripts[scriptId];
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.id = scriptId;
            item.textContent = script.name;
            if (scriptId === appData.lastSelectedScriptId) {
                item.classList.add('active');
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除脚本 "${script.name}" 吗？其下所有句子和图片都将被删除！`)) {
                    deleteScript(scriptId);
                }
            };

            item.appendChild(deleteBtn);
            item.onclick = () => selectScript(scriptId);
            DOM.scriptsList.appendChild(item);
        });
    }
    
    function renderSentences() {
        DOM.sentencesList.innerHTML = '';
        if (!appData.lastSelectedScriptId || !appData.scripts[appData.lastSelectedScriptId]) {
            DOM.currentScriptTitle.textContent = '请先选择一个脚本';
            DOM.addSentenceContainer.style.display = 'none';
            return;
        }

        const script = appData.scripts[appData.lastSelectedScriptId];
        DOM.currentScriptTitle.textContent = `脚本: ${script.name}`;
        DOM.addSentenceContainer.style.display = 'block';

        const sentences = script.sentences || {};
        Object.keys(sentences).forEach(sentenceId => {
            const sentence = sentences[sentenceId];
            const item = document.createElement('div');
            item.className = 'list-item';
            item.dataset.id = sentenceId;
            item.textContent = sentence.text;
            if (sentenceId === appData.lastSelectedSentenceId) {
                item.classList.add('active');
            }

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`确定要删除这个句子吗？`)) {
                    deleteSentence(appData.lastSelectedScriptId, sentenceId);
                }
            };
            
            item.appendChild(deleteBtn);
            item.onclick = () => selectSentence(sentenceId);
            DOM.sentencesList.appendChild(item);
        });
    }

    function renderStoryboard() {
        DOM.thumbnailsContainer.innerHTML = '';
        DOM.mainImage.src = '';
        DOM.mainImage.style.display = 'none';

        if (!appData.lastSelectedScriptId || !appData.lastSelectedSentenceId) {
            DOM.currentSentenceTitle.textContent = '请选择一个句子来添加图片';
            DOM.uploadContainer.style.display = 'none';
            return;
        }

        const sentence = appData.scripts[appData.lastSelectedScriptId]?.sentences?.[appData.lastSelectedSentenceId];
        if (!sentence) return;

        DOM.currentSentenceTitle.textContent = `句子: “${sentence.text.substring(0, 30)}...”`;
        DOM.uploadContainer.style.display = 'block';

        const images = sentence.images || {};
        Object.keys(images).forEach(imageId => {
            const image = images[imageId];
            const thumbDiv = document.createElement('div');
            thumbDiv.className = 'thumbnail';
            thumbDiv.dataset.id = imageId;
            if (imageId === sentence.mainImageId) {
                thumbDiv.classList.add('is-main');
                DOM.mainImage.src = image.data;
                DOM.mainImage.style.display = 'block';
            }

            const img = document.createElement('img');
            img.src = image.data;
            thumbDiv.appendChild(img);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn delete-img-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                deleteImage(imageId);
            };
            thumbDiv.appendChild(deleteBtn);

            thumbDiv.onclick = () => setMainImage(imageId);
            DOM.thumbnailsContainer.appendChild(thumbDiv);
        });

        if (!DOM.mainImage.src) {
             DOM.mainImage.alt = "主图预览区 (暂无图片)";
        }
    }

    // --- Action Functions ---
    function addScript() {
        const name = DOM.newScriptName.value.trim();
        if (!name) return;
        const scriptId = generateId();
        appData.scripts[scriptId] = { name: name, sentences: {} };
        DOM.newScriptName.value = '';
        appData.lastSelectedScriptId = scriptId;
        appData.lastSelectedSentenceId = null; // Reset sentence selection
        saveData();
        renderAll();
    }

    function deleteScript(scriptId) {
        delete appData.scripts[scriptId];
        if (appData.lastSelectedScriptId === scriptId) {
            appData.lastSelectedScriptId = null;
            appData.lastSelectedSentenceId = null;
        }
        saveData();
        renderAll();
    }

    function selectScript(scriptId) {
        appData.lastSelectedScriptId = scriptId;
        appData.lastSelectedSentenceId = null; // Reset sentence selection when script changes
        saveData();
        renderAll();
    }

    function addSentence() {
        const text = DOM.newSentenceText.value.trim();
        if (!text || !appData.lastSelectedScriptId) return;
        const script = appData.scripts[appData.lastSelectedScriptId];
        const sentenceId = generateId();
        script.sentences[sentenceId] = { text: text, images: {}, mainImageId: null };
        DOM.newSentenceText.value = '';
        appData.lastSelectedSentenceId = sentenceId;
        saveData();
        renderAll();
    }
    
    function deleteSentence(scriptId, sentenceId) {
        if (!appData.scripts[scriptId]?.sentences?.[sentenceId]) return;
        delete appData.scripts[scriptId].sentences[sentenceId];
        if (appData.lastSelectedSentenceId === sentenceId) {
            appData.lastSelectedSentenceId = null;
        }
        saveData();
        renderAll();
    }


    function selectSentence(sentenceId) {
        appData.lastSelectedSentenceId = sentenceId;
        saveData();
        renderAll();
    }

    function handleImageUpload(event) {
        const files = event.target.files;
        if (!files.length || !appData.lastSelectedSentenceId) return;

        const sentence = appData.scripts[appData.lastSelectedScriptId].sentences[appData.lastSelectedSentenceId];
        
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imageId = generateId();
                sentence.images[imageId] = { data: e.target.result };
                // If this is the first image, make it the main one
                if (!sentence.mainImageId) {
                    sentence.mainImageId = imageId;
                }
                saveData();
                renderStoryboard(); // Re-render only the part that changed
            };
            reader.readAsDataURL(file); // Convert image to Base64
        });
        
        // Clear the input value to allow uploading the same file again
        event.target.value = null;
    }

    function deleteImage(imageId) {
        const sentence = appData.scripts[appData.lastSelectedScriptId].sentences[appData.lastSelectedSentenceId];
        if (!sentence.images[imageId]) return;

        delete sentence.images[imageId];

        // If the deleted image was the main one, pick a new main image
        if (sentence.mainImageId === imageId) {
            const remainingImageIds = Object.keys(sentence.images);
            sentence.mainImageId = remainingImageIds.length > 0 ? remainingImageIds[0] : null;
        }

        saveData();
        renderStoryboard();
    }

    function setMainImage(imageId) {
        const sentence = appData.scripts[appData.lastSelectedScriptId].sentences[appData.lastSelectedSentenceId];
        sentence.mainImageId = imageId;
        saveData();
        renderStoryboard();
    }
    
    function renderAll() {
        renderScripts();
        renderSentences();
        renderStoryboard();
    }

    // --- Event Listeners ---
    DOM.addScriptBtn.addEventListener('click', addScript);
    DOM.addSentenceBtn.addEventListener('click', addSentence);
    DOM.imageUploadInput.addEventListener('change', handleImageUpload);

    // --- Initial Load ---
    loadData();
    renderAll();
});