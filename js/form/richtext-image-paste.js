/**
 * Rich Text Image Paste Handler
 * Intercepts pasted images and converts them to base64 data URLs
 */

(function() {
    'use strict';
    
    // Store for pasted images per editor
    var pastedImages = {};
    var globalContext = (typeof window !== 'undefined') ? window : {};
    var debugPanelEnabled = (typeof globalContext.RICHTEXT_DEBUG === 'undefined') ? false : !!globalContext.RICHTEXT_DEBUG;
    var debugPanelAnchors = ['top-left', 'bottom-left'];
    var currentAnchorIndex = 0;
    var debugPanelBody = null;
    
    // Cloudflare Worker configuration
    var WORKER_URL = 'https://jotform-image-upload.zeroexeleven.workers.dev'; // Replace after deploying worker
    var IMAGE_UPLOAD_ENABLED = true; // Set to true after deploying worker
    var uploadQueue = [];
    var uploadsInProgress = 0;
    
    function logDebug(message, data) {
        if (typeof console !== 'undefined' && console.log) {
            console.log('[RichText]', message, data || '');
        }
        
        // Show status in page title for mobile debugging
        if (message.indexOf('blob') !== -1 || message.indexOf('Converted') !== -1) {
            var original = document.title.split(' [')[0];
            document.title = original + ' [' + message.slice(0, 30) + ']';
            setTimeout(function() {
                document.title = original;
            }, 3000);
        }
        
        if (!debugPanelEnabled) return;
        var body = ensureDebugPanel();
        if (!body) return;
        var entry = document.createElement('div');
        var ts = new Date().toLocaleTimeString();
        var extra = data ? ' ' + formatDebugData(data) : '';
        entry.textContent = ts + ' - ' + message + extra;
        body.appendChild(entry);
        while (body.children.length > 80) {
            body.removeChild(body.firstChild);
        }
        body.scrollTop = body.scrollHeight;
        if (body.style.display !== 'block') {
            body.style.display = 'block';
        }
    }
    
    function formatDebugData(data) {
        try {
            if (typeof data === 'string') return data;
            return JSON.stringify(data);
        } catch (err) {
            return '[unserializable]';
        }
    }
    
    function positionPanel(panel) {
        var anchor = debugPanelAnchors[currentAnchorIndex];
        if (anchor === 'top-left') {
            panel.style.top = '10px';
            panel.style.left = '10px';
            panel.style.bottom = 'auto';
            panel.style.right = 'auto';
        } else if (anchor === 'bottom-left') {
            panel.style.bottom = '10px';
            panel.style.left = '10px';
            panel.style.top = 'auto';
            panel.style.right = 'auto';
        }
    }
    
    function ensureDebugPanel() {
        if (!debugPanelEnabled) return null;
        if (debugPanelBody) return debugPanelBody;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', ensureDebugPanel, { once: true });
            return null;
        }
        var panel = document.createElement('div');
        panel.id = 'richtext-debug-panel';
        panel.style.position = 'fixed';
        positionPanel(panel);
        panel.style.zIndex = '9999';
        panel.style.fontSize = '11px';
        panel.style.fontFamily = 'monospace';
        panel.style.maxWidth = '90vw';
        panel.style.color = '#f7f7f7';
        panel.style.background = 'rgba(0,0,0,0.7)';
        panel.style.borderRadius = '6px';
        panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
        
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.textContent = 'Logs';
        toggle.style.background = 'rgba(255,255,255,0.15)';
        toggle.style.color = '#fff';
        toggle.style.border = 'none';
        toggle.style.padding = '4px 10px';
        toggle.style.cursor = 'pointer';
        toggle.style.width = '100%';
        toggle.style.fontSize = '11px';
        toggle.style.borderRadius = '6px 6px 0 0';
        
        var body = document.createElement('div');
        body.style.maxHeight = '160px';
        body.style.overflow = 'auto';
        body.style.padding = '6px 8px';
        body.style.display = 'block';
        
        toggle.addEventListener('click', function(event) {
            var isVisible = body.style.display === 'block';
            if (event.shiftKey) {
                currentAnchorIndex = (currentAnchorIndex + 1) % debugPanelAnchors.length;
                positionPanel(panel);
                return;
            }
            body.style.display = isVisible ? 'none' : 'block';
        });
        
        panel.appendChild(toggle);
        panel.appendChild(body);
        document.body.appendChild(panel);
        debugPanelBody = body;
        var intro = document.createElement('div');
        intro.textContent = 'Rich text logs ready';
        body.appendChild(intro);
        return debugPanelBody;
    }

    function primeDebugPanel() {
        if (!debugPanelEnabled) return;
        var showPanel = function() {
            var body = ensureDebugPanel();
            if (body) {
                body.style.display = 'block';
            }
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', showPanel, { once: true });
        } else {
            showPanel();
        }
    }
    
    function init() {
        primeDebugPanel();
        // Wait for nicEdit to be available
        if (typeof nicEditors === 'undefined') {
            setTimeout(init, 100);
            return;
        }
        
        // Hook into nicEdit instances
        var checkInterval = setInterval(function() {
            if (!window.nicEditors || !nicEditors.editors || nicEditors.editors.length === 0) {
                return;
            }
            
            clearInterval(checkInterval);
            setupPasteHandlers();
        }, 200);
        
        // Also set up when new editors are created
        if (nicEditors.addEditor) {
            var originalAddEditor = nicEditors.addEditor;
            nicEditors.addEditor = function() {
                var result = originalAddEditor.apply(this, arguments);
                setTimeout(setupPasteHandlers, 100);
                return result;
            };
        }
        
        // Watch for page changes (multi-page forms)
        // Setup handlers when pages become visible
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    var target = mutation.target;
                    if (target.classList && target.classList.contains('page-section')) {
                        // Check if page became visible
                        var isVisible = target.style.display !== 'none';
                        if (isVisible) {
                            logDebug('Page became visible, checking for editors');
                            
                            // Find textareas on this page that need nicEdit
                            var textareas = target.querySelectorAll('textarea[data-richtext="Yes"]');
                            for (var i = 0; i < textareas.length; i++) {
                                var textarea = textareas[i];
                                var fieldId = textarea.id;
                                
                                // Preserve existing content before any reinitialization
                                var savedContent = textarea.value;
                                
                                // Check if nicEdit is already initialized
                                var hasNicEdit = textarea.parentNode.querySelector('.nicEdit-main');
                                if (!hasNicEdit && window.JotForm && JotForm.setupRichArea) {
                                    // Extract qid from input_XXX
                                    var qid = fieldId.replace('input_', '');
                                    logDebug('Reinitializing nicEdit for field ' + fieldId + ', preserving ' + savedContent.length + ' chars');
                                    
                                    try {
                                        // Restore content first
                                        if (savedContent) {
                                            textarea.value = savedContent;
                                        }
                                        JotForm.setupRichArea(qid);
                                        
                                        // Restore content again after initialization
                                        setTimeout(function() {
                                            if (savedContent && textarea.value !== savedContent) {
                                                textarea.value = savedContent;
                                                // Try to sync with nicEdit instance
                                                var instance = getInstanceFromElement(textarea);
                                                if (instance && instance.elm && savedContent) {
                                                    instance.elm.innerHTML = savedContent;
                                                    logDebug('Restored ' + savedContent.length + ' chars to editor');
                                                }
                                            }
                                        }, 100);
                                    } catch (e) {
                                        logDebug('Error reinitializing: ' + e.message);
                                    }
                                }
                            }
                            
                            setTimeout(setupPasteHandlers, 200);
                        }
                    }
                }
            });
        });
        
        // Observe all page sections
        var pageSections = document.querySelectorAll('.page-section');
        for (var i = 0; i < pageSections.length; i++) {
            observer.observe(pageSections[i], {
                attributes: true,
                attributeFilter: ['style']
            });
        }
        logDebug('Observing ' + pageSections.length + ' page sections');
        
        // Also periodically check for new editors (more frequently)
        setInterval(setupPasteHandlers, 1000);
        
        // Extra aggressive check for the first 10 seconds
        var earlyCheckCount = 0;
        var earlyCheckInterval = setInterval(function() {
            setupPasteHandlers();
            earlyCheckCount++;
            if (earlyCheckCount >= 20) {
                clearInterval(earlyCheckInterval);
            }
        }, 500);
    }
    
    function setupPasteHandlers() {
        if (!window.nicEditors || !nicEditors.editors) return;
        
        var editors = nicEditors.editors;
        var newHandlersAdded = 0;
        
        for (var i = 0; i < editors.length; i++) {
            var editor = editors[i];
            var instances = editor.nicInstances;
            if (!instances) continue;
            
            for (var j = 0; j < instances.length; j++) {
                var instance = instances[j];
                if (!instance.elm || instance._pasteHandlerAdded) continue;
                
                var textareaId = instance.e ? instance.e.id : 'unknown';
                logDebug('Setting up handler for ' + textareaId);
                
                attachPasteHandler(instance);
                instance._pasteHandlerAdded = true;
                newHandlersAdded++;
                
                // Scan for existing images in this editor
                scanExistingImages(instance);
            }
        }
        
        if (newHandlersAdded > 0) {
            logDebug('Added ' + newHandlersAdded + ' new paste handlers');
        }
    }
    
    function scanExistingImages(instance) {
        if (!instance || !instance.elm) return;
        
        var textareaId = instance.e ? instance.e.id : null;
        var existingImages = instance.elm.querySelectorAll('img');
        
        if (existingImages.length > 0) {
            logDebug('Found ' + existingImages.length + ' existing images on page load');
            
            for (var i = 0; i < existingImages.length; i++) {
                var img = existingImages[i];
                var src = (img.src || '').trim();
                
                // Skip if already uploaded to Cloudflare
                if (IMAGE_UPLOAD_ENABLED && src.indexOf(WORKER_URL) === 0) {
                    logDebug('Skipping image already on Cloudflare', { src: src.slice(0, 60) });
                    img.dataset.imageUploaded = 'true';
                    continue;
                }
                
                // Skip if already processed
                if (img.dataset.imageUploaded === 'true' || img.dataset.imageUploading === 'true') {
                    continue;
                }
                
                // Process based on type
                if (src.indexOf('blob:') === 0) {
                    logDebug('Existing blob image detected', { src: src.slice(0, 60) });
                    handleInsertedImage(img, instance, textareaId);
                } else if (IMAGE_UPLOAD_ENABLED && /^https?:/i.test(src)) {
                    logDebug('Existing external image detected', { src: src.slice(0, 60) });
                    handleInsertedImage(img, instance, textareaId);
                } else if (src.indexOf('data:image') === 0) {
                    logDebug('Existing data URL detected');
                    if (IMAGE_UPLOAD_ENABLED) {
                        uploadToImageHost(img, src, instance);
                    }
                }
            }
        }
    }
    
    function attachPasteHandler(instance) {
        var editorElement = instance.elm;
        var textareaId = instance.e ? instance.e.id : null;
        
        if (!editorElement) return;
        
        // Initialize storage for this editor
        if (textareaId && !pastedImages[textareaId]) {
            pastedImages[textareaId] = [];
        }
        
        // Handle paste events
        editorElement.addEventListener('paste', function(event) {
            handlePaste(event, instance, textareaId);
        });
        
        patchInstancePersistence(instance, textareaId);
        
        // Use MutationObserver to detect when images are added to the editor
        var observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.addedNodes && mutation.addedNodes.length > 0) {
                    for (var i = 0; i < mutation.addedNodes.length; i++) {
                        var node = mutation.addedNodes[i];
                        if (node.nodeName === 'IMG') {
                            handleInsertedImage(node, instance, textareaId);
                        }
                        if (node.querySelectorAll) {
                            var imgs = node.querySelectorAll('img');
                            for (var j = 0; j < imgs.length; j++) {
                                handleInsertedImage(imgs[j], instance, textareaId);
                            }
                        }
                    }
                }
            });
        });
        
        observer.observe(editorElement, {
            childList: true,
            subtree: true
        });
        
        instance._imageObserver = observer;
    }

    function patchInstancePersistence(instance, textareaId) {
        if (!instance || instance._richtextPersistencePatched) return;
        
        var originalSave = instance.saveContent ? instance.saveContent.bind(instance) : null;
        
        instance.saveContent = function() {
            // ALWAYS read directly from DOM, bypass nicEdit cache
            if (instance.e && instance.e.tagName === 'TEXTAREA' && instance.elm) {
                instance.e.value = instance.elm.innerHTML;
            }
            if (originalSave) {
                originalSave();
            }
            persistEditorContent(instance);
        };
        
        var editorElement = instance.elm;
        if (editorElement) {
            var ensureConversion = function() {
                convertAllImagesToDataUrl(instance, textareaId);
                // Also retry after a delay
                setTimeout(function() {
                    convertAllImagesToDataUrl(instance, textareaId);
                    persistEditorContent(instance);
                }, 200);
            };
            editorElement.addEventListener('blur', ensureConversion);
            editorElement.addEventListener('focusout', ensureConversion);
        }
        
        // Periodically check for unconverted images
        if (!instance._conversionPoller) {
            instance._conversionPoller = setInterval(function() {
                if (instance.elm) {
                    var needsConversion = false;
                    var blobUrls = [];
                    var images = instance.elm.querySelectorAll('img');
                    for (var i = 0; i < images.length; i++) {
                        var src = (images[i].src || '').trim();
                        if (src.indexOf('blob:') === 0) {
                            needsConversion = true;
                            blobUrls.push(src.slice(0, 60));
                        }
                    }
                    if (needsConversion) {
                        logDebug('Polling found ' + blobUrls.length + ' unconverted blob(s)', { urls: blobUrls });
                        convertAllImagesToDataUrl(instance, textareaId);
                    }
                    
                    // ALSO: Always sync content to textarea periodically (even if no conversion needed)
                    // This ensures content is never lost during page navigation
                    if (instance.e && instance.e.tagName === 'TEXTAREA') {
                        var currentEditorContent = instance.elm.innerHTML;
                        var currentTextareaContent = instance.e.value;
                        
                        // Only update if there's a difference (avoid unnecessary updates)
                        if (currentEditorContent !== currentTextareaContent) {
                            instance.e.value = currentEditorContent;
                            logDebug('Periodic sync: updated textarea for ' + textareaId);
                        }
                    }
                }
            }, 1000);
        }
        
        instance._richtextPersistencePatched = true;
    }

    function convertAllImagesToDataUrl(instance, textareaId) {
        if (!instance || !instance.elm) return;
        var images = instance.elm.querySelectorAll('img');
        var hasPendingConversions = false;
        for (var i = 0; i < images.length; i++) {
            var img = images[i];
            var src = (img.src || '').trim();
            if (!src || src.indexOf('data:image') === 0) continue;
            if (img.dataset.converting === 'true') {
                hasPendingConversions = true;
                continue;
            }
            convertImageElementToDataUrl(img, instance, textareaId);
        }
        if (hasPendingConversions) {
            logDebug('Images still converting, will retry persistence');
        }
    }
    
    function handleInsertedImage(img, instance, textareaId) {
        // Skip if already processed
        if (img.classList.contains('richtext-captured')) {
            return;
        }
        
        img.classList.add('richtext-captured');
        
        var src = img.src;
        logDebug('Image inserted into editor', { src: src ? src.slice(0, 80) : 'n/a' });
        
        // Apply styling to ensure visibility
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'inline-block';
        
        var normalizedSrc = (src || '').trim();
        var isDataUrl = normalizedSrc.indexOf('data:image') === 0;
        var isBlob = normalizedSrc.indexOf('blob:') === 0;
        var isRemote = /^https?:/i.test(normalizedSrc);
        
        // Process based on source type
        if (isDataUrl) {
            captureImageData(normalizedSrc, textareaId);
            // Upload data URL to Cloudflare if enabled
            if (IMAGE_UPLOAD_ENABLED) {
                uploadToImageHost(img, normalizedSrc, instance);
            } else {
                persistEditorContent(instance);
            }
        } else if (isBlob) {
            // Force immediate fetch-based conversion
            logDebug('Converting blob URL', { src: normalizedSrc.slice(0, 60) });
            fetch(normalizedSrc)
                .then(function(response) { return response.blob(); })
                .then(function(blob) {
                    logDebug('Blob fetched', { size: Math.round(blob.size / 1024) + 'KB' });
                    var reader = new FileReader();
                    reader.onload = function(e) {
                        var dataUrl = e.target.result;
                        logDebug('Blob converted to data URL', { size: Math.round(dataUrl.length / 1024) + 'KB' });
                        img.src = dataUrl;
                        img.setAttribute('src', dataUrl);
                        img.style.maxWidth = '100%';
                        img.style.height = 'auto';
                        img.style.display = 'inline-block';
                        img.style.visibility = 'visible';
                        captureImageData(dataUrl, textareaId);
                        
                        // Upload to Cloudflare if enabled
                        if (IMAGE_UPLOAD_ENABLED) {
                            uploadToImageHost(img, dataUrl, instance);
                        } else {
                            // Force nicEdit to re-sync from DOM
                            if (instance) {
                                // Update the underlying textarea with current editor HTML
                                if (instance.e && instance.e.tagName === 'TEXTAREA') {
                                    instance.e.value = instance.elm.innerHTML;
                                    
                                    // Trigger all the events to make sure Jotform knows
                                    var events = ['input', 'change', 'keyup'];
                                    for (var i = 0; i < events.length; i++) {
                                        var evt;
                                        if (typeof Event === 'function') {
                                            evt = new Event(events[i], { bubbles: true, cancelable: true });
                                        } else {
                                            evt = document.createEvent('HTMLEvents');
                                            evt.initEvent(events[i], true, true);
                                        }
                                        instance.e.dispatchEvent(evt);
                                    }
                                }
                                
                                // Force nicEdit's internal sync
                                if (typeof instance.saveContent === 'function') {
                                    setTimeout(function() {
                                        instance.saveContent();
                                    }, 50);
                                }
                            }
                        }
                    };
                    reader.readAsDataURL(blob);
                })
                .catch(function(err) {
                    console.error('Blob fetch failed:', err);
                    logDebug('Blob conversion error', err.message || 'fetch failed');
                });
        } else if (isRemote) {
            // Download and convert external URLs
            logDebug('Processing external image', { src: normalizedSrc.slice(0, 60) });
            downloadAndConvertImage(img, normalizedSrc, textareaId, instance);
        } else {
            // Fallback: attempt in-place conversion
            convertImageElementToDataUrl(img, instance, textareaId);
        }
    }
    

    function convertImageElementToDataUrl(imgElement, instance, textareaId) {
        if (!imgElement) return;
        var src = imgElement.src || '';
        if (!src) return;
        // Skip if already converted
        if (src.indexOf('data:image') === 0) return;
        if (imgElement.dataset.converting === 'true') return;
        imgElement.dataset.converting = 'true';
        var cleanup = function() { delete imgElement.dataset.converting; };
        var activeInstance = instance || getInstanceFromElement(imgElement);
        
        var finishWithDataUrl = function(dataUrl) {
            cleanup();
            if (!dataUrl) return;
            applyDataUrlToImage(imgElement, dataUrl, textareaId, activeInstance);
        };
        
        // For blob URLs, try canvas conversion first (synchronous)
        if (src.indexOf('blob:') === 0) {
            // Try immediate canvas conversion
            if (imgElement.complete && imgElement.naturalWidth) {
                try {
                    var canvas = document.createElement('canvas');
                    canvas.width = imgElement.naturalWidth;
                    canvas.height = imgElement.naturalHeight;
                    var ctx = canvas.getContext('2d');
                    ctx.drawImage(imgElement, 0, 0);
                    var dataUrl = canvas.toDataURL('image/png');
                    cleanup();
                    applyDataUrlToImage(imgElement, dataUrl, textareaId, activeInstance);
                    logDebug('Converted blob via canvas (sync)', { width: canvas.width, height: canvas.height });
                    return;
                } catch (err) {
                    logDebug('Sync canvas conversion failed', err.message || 'canvas error');
                }
            }
            
            // Wait for load if not ready
            if (!imgElement.complete) {
                logDebug('Image not loaded yet, waiting...');
                var loadHandler = function() {
                    imgElement.removeEventListener('load', loadHandler);
                    try {
                        var canvas = document.createElement('canvas');
                        canvas.width = imgElement.naturalWidth;
                        canvas.height = imgElement.naturalHeight;
                        var ctx = canvas.getContext('2d');
                        ctx.drawImage(imgElement, 0, 0);
                        var dataUrl = canvas.toDataURL('image/png');
                        cleanup();
                        applyDataUrlToImage(imgElement, dataUrl, textareaId, activeInstance);
                        logDebug('Converted blob via canvas (after load)', { width: canvas.width, height: canvas.height });
                    } catch (err) {
                        logDebug('Canvas failed after load, trying fetch', err.message || 'canvas error');
                        tryFetchConversion();
                    }
                };
                imgElement.addEventListener('load', loadHandler);
                // Set a timeout fallback
                setTimeout(function() {
                    if (imgElement.dataset.converting === 'true') {
                        imgElement.removeEventListener('load', loadHandler);
                        logDebug('Load timeout, trying fetch');
                        tryFetchConversion();
                    }
                }, 2000);
                return;
            }
            
            // Fallback to fetch if canvas fails or image not loaded
            var tryFetchConversion = function() {
                if (typeof fetch === 'function') {
                    fetch(src).then(function(response) {
                        return response.blob();
                    }).then(function(blob) {
                        var reader = new FileReader();
                        reader.onload = function(e) {
                            finishWithDataUrl(e.target.result);
                        };
                        reader.onerror = function() {
                            cleanup();
                            fallbackCanvasConversion(imgElement, textareaId, activeInstance);
                        };
                        reader.readAsDataURL(blob);
                    }).catch(function() {
                        cleanup();
                        fallbackCanvasConversion(imgElement, textareaId, activeInstance);
                    });
                    return;
                }
                cleanup();
                fallbackCanvasConversion(imgElement, textareaId, activeInstance);
            };
            tryFetchConversion();
            return;
        }
        
        fallbackCanvasConversion(imgElement, textareaId, activeInstance, cleanup);
    }
    
    function fallbackCanvasConversion(imgElement, textareaId, instance, cleanup) {
        var attemptConversion = function() {
            try {
                var width = imgElement.naturalWidth || imgElement.width || 1;
                var height = imgElement.naturalHeight || imgElement.height || 1;
                if (!width || !height) {
                    if (typeof cleanup === 'function') cleanup();
                    return;
                }
                var canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                var ctx = canvas.getContext('2d');
                ctx.drawImage(imgElement, 0, 0, width, height);
                var dataUrl = canvas.toDataURL('image/png');
                if (typeof cleanup === 'function') cleanup();
                applyDataUrlToImage(imgElement, dataUrl, textareaId, instance);
                logDebug('Converted inline image', { width: width, height: height });
            } catch (err) {
                if (typeof cleanup === 'function') cleanup();
                console.warn('Inline conversion failed, falling back to external capture:', err);
                logDebug('Inline conversion failed', err && err.message ? err.message : 'conversion error');
                captureExternalImage(imgElement, textareaId, instance);
            }
        };
        
        if (!imgElement.complete || !imgElement.naturalWidth) {
            var handleLoad = function() {
                imgElement.removeEventListener('load', handleLoad);
                attemptConversion();
            };
            imgElement.addEventListener('load', handleLoad);
            return;
        }
        
        attemptConversion();
    }
    
    function applyDataUrlToImage(imgElement, dataUrl, textareaId, instance) {
        if (!dataUrl) return;
        imgElement.src = dataUrl;
        imgElement.setAttribute('src', dataUrl);
        imgElement.style.maxWidth = '100%';
        imgElement.style.height = 'auto';
        imgElement.style.display = 'inline-block';
        imgElement.style.visibility = 'visible';
        captureImageData(dataUrl, textareaId);
        
        // Upload to image host if enabled
        if (IMAGE_UPLOAD_ENABLED) {
            uploadToImageHost(imgElement, dataUrl, instance);
        } else {
            persistEditorContent(instance);
        }
    }
    
    function uploadToImageHost(imgElement, dataUrl, instance) {
        if (!dataUrl || dataUrl.indexOf('data:image') !== 0) {
            persistEditorContent(instance);
            return;
        }
        
        if (!WORKER_URL || WORKER_URL === 'YOUR_WORKER_URL') {
            logDebug('Worker URL not configured, keeping data URL');
            persistEditorContent(instance);
            return;
        }
        
        // Check if already uploaded
        if (imgElement.dataset.imageUploaded === 'true') {
            return;
        }
        
        imgElement.dataset.imageUploading = 'true';
        uploadsInProgress++;
        logDebug('Uploading to Cloudflare...', { size: Math.round(dataUrl.length / 1024) + 'KB' });
        
        // Convert data URL to blob
        var arr = dataUrl.split(',');
        var mime = arr[0].match(/:(.*?);/)[1];
        var bstr = atob(arr[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        while(n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        var blob = new Blob([u8arr], {type: mime});
        
        var formData = new FormData();
        formData.append('image', blob, 'image.png');
        
        fetch(WORKER_URL + '/upload', {
            method: 'POST',
            body: formData
        })
        .then(function(response) {
            if (!response.ok) {
                return response.text().then(function(text) {
                    throw new Error('HTTP ' + response.status + ': ' + text);
                });
            }
            return response.json();
        })
        .then(function(result) {
            uploadsInProgress--;
            delete imgElement.dataset.imageUploading;
            
            if (result.success && result.url) {
                logDebug('✓ Upload success: ' + result.url);
                
                // Replace data URL with hosted URL
                imgElement.src = result.url;
                imgElement.setAttribute('src', result.url);
                imgElement.dataset.imageUploaded = 'true';
                
                // Multiple forced syncs to ensure it sticks
                persistEditorContent(instance);
                
                setTimeout(function() {
                    persistEditorContent(instance);
                    logDebug('Image persisted to textarea', { url: result.url.slice(0, 60) });
                }, 100);
                
                setTimeout(function() {
                    persistEditorContent(instance);
                }, 300);
            } else {
                logDebug('✗ Upload failed, keeping data URL', result);
                persistEditorContent(instance);
            }
        })
        .catch(function(error) {
            uploadsInProgress--;
            delete imgElement.dataset.imageUploading;
            logDebug('Cloudflare upload error, keeping data URL', error.message || 'network error');
            persistEditorContent(instance);
        });
    }
    
    function persistEditorContent(instance) {
        if (!instance || !instance.elm) return;
        if (instance._isPersisting) return;
        instance._isPersisting = true;
        try {
            // ALWAYS force read from DOM first
            if (instance.e && instance.e.tagName === 'TEXTAREA') {
                instance.e.value = instance.elm.innerHTML;
            }
            
            if (typeof instance.syncContents === 'function') {
                instance.syncContents();
            } else if (typeof instance.sync === 'function') {
                instance.sync();
            }
            
            // Force again after sync
            if (instance.e && instance.e.tagName === 'TEXTAREA') {
                instance.e.value = instance.elm.innerHTML;
                triggerFieldUpdate(instance.e);
            } else {
                triggerFieldUpdate(instance.elm);
            }
        } finally {
            instance._isPersisting = false;
        }
    }

    function triggerFieldUpdate(target) {
        if (!target) return;
        var events = ['input', 'keyup', 'change'];
        for (var i = 0; i < events.length; i++) {
            try {
                var evt;
                if (typeof Event === 'function') {
                    evt = new Event(events[i], { bubbles: true, cancelable: true });
                } else {
                    evt = document.createEvent('HTMLEvents');
                    evt.initEvent(events[i], true, true);
                }
                target.dispatchEvent(evt);
            } catch (err) {
                // swallow
            }
        }
    }
    
    
    function captureImageData(dataUrl, textareaId) {
        try {
            var arr = dataUrl.split(',');
            var mimeMatch = arr[0].match(/:(.*?);/);
            var mime = mimeMatch ? mimeMatch[1] : 'image/png';
            var bstr = atob(arr[1] || '');
            var size = bstr.length;
            
            var imageData = {
                dataUrl: dataUrl,
                size: size,
                type: mime,
                timestamp: new Date().toISOString()
            };
            
            if (textareaId && pastedImages[textareaId]) {
                pastedImages[textareaId].push(imageData);
                logDebug('Image captured', {
                    field: textareaId,
                    count: pastedImages[textareaId].length,
                    type: mime
                });
            }
        } catch (e) {
            console.warn('Could not capture image data:', e);
            logDebug('Could not capture image data', e && e.message ? e.message : 'capture error');
        }
    }
    
    function downloadAndConvertImage(imgElement, imageUrl, textareaId, instanceRef) {
        // Use Cloudflare Worker proxy to download external image (bypasses CORS)
        if (!IMAGE_UPLOAD_ENABLED || !WORKER_URL || WORKER_URL === 'YOUR_WORKER_URL') {
            logDebug('Worker not configured, leaving external URL as-is');
            return;
        }
        
        logDebug('Proxying external image via Worker', { url: imageUrl.slice(0, 60) });
        
        // Mark as processing
        imgElement.dataset.imageUploading = 'true';
        uploadsInProgress++;
        
        var formData = new FormData();
        formData.append('url', imageUrl);
        
        fetch(WORKER_URL + '/proxy', {
            method: 'POST',
            body: formData
        })
        .then(function(response) {
            return response.json();
        })
        .then(function(result) {
            uploadsInProgress--;
            delete imgElement.dataset.imageUploading;
            
            if (result.success && result.url) {
                logDebug('External image proxied successfully', { url: result.url });
                
                // Replace external URL with hosted URL
                imgElement.src = result.url;
                imgElement.setAttribute('src', result.url);
                imgElement.dataset.imageUploaded = 'true';
                
                persistEditorContent(instanceRef);
            } else {
                logDebug('External image proxy failed, keeping original URL', result);
                persistEditorContent(instanceRef);
            }
        })
        .catch(function(error) {
            uploadsInProgress--;
            delete imgElement.dataset.imageUploading;
            logDebug('External image proxy error, keeping original URL', error.message || 'network error');
            persistEditorContent(instanceRef);
        });
    }
    
    function captureExternalImage(imgElement, textareaId, instanceRef) {
        // Legacy function - redirect to new implementation
        downloadAndConvertImage(imgElement, imgElement.src, textareaId, instanceRef);
    }
    
    function captureExternalImage_OLD(imgElement, textareaId, instanceRef) {
        // Try to convert external/blob images to data URLs
        var originalSrc = imgElement.src;
        
        logDebug('Attempting to convert image', { src: originalSrc ? originalSrc.slice(0, 80) : 'n/a' });
        
        // Create a temporary canvas immediately to prevent the image from being cleaned up
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        
        // For blob URLs, we need to load and convert immediately before they expire
        var img = new Image();
        
        // Don't set crossOrigin for blob URLs
        if (originalSrc.indexOf('blob:') !== 0) {
            img.crossOrigin = 'anonymous';
        }
        
        img.onload = function() {
            try {
                // Set canvas dimensions
                canvas.width = img.naturalWidth || img.width;
                canvas.height = img.naturalHeight || img.height;
                
                // Draw the image
                ctx.drawImage(img, 0, 0);
                
                // Convert to data URL
                var dataUrl = canvas.toDataURL('image/png');
                
                logDebug('Converted external/blob image', { length: dataUrl.length });
                
                // Replace the blob URL with data URL in the editor IMMEDIATELY
                imgElement.src = dataUrl;
                imgElement.setAttribute('src', dataUrl);
                
                // Apply styling to ensure it's visible
                imgElement.style.maxWidth = '100%';
                imgElement.style.height = 'auto';
                imgElement.style.display = 'inline-block';
                imgElement.style.visibility = 'visible';
                
                // Store the image data
                captureImageData(dataUrl, textareaId);
                
                // Persist content back to the textarea
                var activeInstance = instanceRef || getInstanceFromElement(imgElement);
                persistEditorContent(activeInstance);
                
                logDebug('Image updated in editor and textarea');
                
                // Revoke the blob URL to free memory
                if (originalSrc.indexOf('blob:') === 0) {
                    setTimeout(function() {
                        URL.revokeObjectURL(originalSrc);
                    }, 1000);
                }
            } catch (e) {
                console.error('Failed to convert image to data URL:', e);
                logDebug('Failed to convert image to data URL', e && e.message ? e.message : 'unknown error');
            }
        };
        
        img.onerror = function(e) {
            console.error('Failed to load image from:', originalSrc, e);
            logDebug('Failed to load image', { src: originalSrc, error: e && e.message ? e.message : e });
        };
        
        // Load the image immediately
        img.src = originalSrc;
    }
    
    function getInstanceFromElement(element) {
        // Find the nicEdit instance for this element
        if (!window.nicEditors || !nicEditors.editors) return null;
        
        var editors = nicEditors.editors;
        for (var i = 0; i < editors.length; i++) {
            var editor = editors[i];
            var instances = editor.nicInstances;
            
            if (!instances) continue;
            
            for (var j = 0; j < instances.length; j++) {
                var instance = instances[j];
                if (instance.elm && instance.elm.contains(element)) {
                    return instance;
                }
            }
        }
        return null;
    }
    
    function handlePaste(event, instance, textareaId) {
        var clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData) return;
        
        var hasImage = false;
        var imageBlob = null;
        
        // Check for image files first
        if (clipboardData.items) {
            var items = clipboardData.items;
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                
                // Check if it's an image
                if (item.type.indexOf('image') !== -1) {
                    hasImage = true;
                    imageBlob = item.getAsFile();
                    if (imageBlob) break;
                }
            }
        }
        
        // Also check for image files in the files array (for some browsers/stickers)
        if (!hasImage && clipboardData.files && clipboardData.files.length > 0) {
            for (var j = 0; j < clipboardData.files.length; j++) {
                var file = clipboardData.files[j];
                if (file.type.indexOf('image') !== -1) {
                    hasImage = true;
                    imageBlob = file;
                    break;
                }
            }
        }
        
        // Check for HTML content with images (some stickers/emojis)
        if (!hasImage) {
            var html = clipboardData.getData('text/html');
            if (html && html.indexOf('<img') !== -1) {
                // Extract image src from HTML
                var match = html.match(/<img[^>]+src="([^">]+)"/);
                if (match && match[1]) {
                    event.preventDefault();
                    event.stopPropagation();
                    // Handle image URL
                    fetchAndProcessImageFromUrl(match[1], instance, textareaId);
                    return;
                }
            }
        }
        
        // Process image blob if found
        if (hasImage && imageBlob) {
            event.preventDefault();
            event.stopPropagation();
            processImage(imageBlob, instance, textareaId);
        }
    }
    
    function fetchAndProcessImageFromUrl(url, instance, textareaId) {
        // If it's a data URL, process directly
        if (url.indexOf('data:image') === 0) {
            insertImageIntoEditor(instance, url);
            
            // Try to convert to blob for storage
            try {
                var arr = url.split(',');
                var mime = arr[0].match(/:(.*?);/)[1];
                var bstr = atob(arr[1]);
                var n = bstr.length;
                var u8arr = new Uint8Array(n);
                while(n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                var blob = new Blob([u8arr], {type: mime});
                
                var imageData = {
                    dataUrl: url,
                    size: blob.size,
                    type: mime,
                    timestamp: new Date().toISOString()
                };
                
                if (textareaId && pastedImages[textareaId]) {
                    pastedImages[textareaId].push(imageData);
                }
            } catch (e) {
                console.warn('Could not convert data URL to blob:', e);
                logDebug('Could not convert data URL to blob', e && e.message ? e.message : 'error');
            }
            return;
        }
        
        // For external URLs, just insert them directly
        // Note: Cross-origin images may not work for conversion
        insertImageIntoEditor(instance, url);
        logDebug('Inserted image from URL', { src: url ? url.slice(0, 80) : 'n/a' });
    }
    
    function processImage(blob, instance, textareaId) {
        var reader = new FileReader();
        
        reader.onload = function(e) {
            var dataUrl = e.target.result;
            
            // Store the image data
            var imageData = {
                dataUrl: dataUrl,
                size: blob.size,
                type: blob.type,
                timestamp: new Date().toISOString()
            };
            
            if (textareaId && pastedImages[textareaId]) {
                pastedImages[textareaId].push(imageData);
                logDebug('Image saved from paste', {
                    field: textareaId,
                    count: pastedImages[textareaId].length,
                    size: formatBytes(blob.size),
                    type: blob.type
                });
            }
            
            // Insert image into editor
            insertImageIntoEditor(instance, dataUrl);
        };
        
        reader.onerror = function() {
            console.error('Failed to read pasted image');
            logDebug('Failed to read pasted image');
        };
        
        reader.readAsDataURL(blob);
    }
    
    function insertImageIntoEditor(instance, dataUrl) {
        if (!instance.elm) return;
        
        // Focus the editor first to ensure proper insertion
        instance.elm.focus();
        
        // Create image element
        var img = document.createElement('img');
        img.src = dataUrl;
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'inline-block';
        img.style.margin = '5px 0';
        img.className = 'richtext-pasted-image';
        
        // Get or create a valid selection/range
        var sel = window.getSelection();
        var range;
        
        if (sel.rangeCount > 0) {
            range = sel.getRangeAt(0);
        } else {
            // Create a new range at the end of the editor
            range = document.createRange();
            range.selectNodeContents(instance.elm);
            range.collapse(false); // collapse to end
        }
        
        // Make sure we're in the editor
        var container = range.commonAncestorContainer;
        var inEditor = false;
        var check = container.nodeType === 3 ? container.parentNode : container;
        
        while (check && check !== document.body) {
            if (check === instance.elm) {
                inEditor = true;
                break;
            }
            check = check.parentNode;
        }
        
        if (!inEditor) {
            // If not in editor, just append to the end
            instance.elm.appendChild(document.createElement('br'));
            instance.elm.appendChild(img);
            instance.elm.appendChild(document.createElement('br'));
        } else {
            // Insert at current position
            try {
                range.deleteContents();
                
                // Create a wrapper for better formatting
                var wrapper = document.createElement('div');
                wrapper.appendChild(img);
                
                range.insertNode(wrapper);
                
                // Move cursor after image
                range.setStartAfter(wrapper);
                range.setEndAfter(wrapper);
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (e) {
                // Fallback: append to end
                console.warn('Failed to insert at cursor, appending to end:', e);
                logDebug('Failed to insert at cursor', e && e.message ? e.message : 'insert error');
                instance.elm.appendChild(document.createElement('br'));
                instance.elm.appendChild(img);
                instance.elm.appendChild(document.createElement('br'));
            }
        }
        
        // Trigger content update in nicEdit
        if (instance.saveContent) {
            instance.saveContent();
        }
        
        // Also trigger change event
        if (instance.e && instance.e.tagName === 'TEXTAREA') {
            var event = document.createEvent('HTMLEvents');
            event.initEvent('change', true, false);
            instance.e.dispatchEvent(event);
        }
        
        logDebug('Image inserted via script');
    }
    
    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        var k = 1024;
        var sizes = ['Bytes', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // Public API to retrieve pasted images
    window.getRichTextPastedImages = function(textareaId) {
        if (textareaId) {
            return pastedImages[textareaId] || [];
        }
        return pastedImages;
    };
    
    // Clear images for a specific field
    window.clearRichTextPastedImages = function(textareaId) {
        if (textareaId && pastedImages[textareaId]) {
            pastedImages[textareaId] = [];
        }
    };
    
    // Attach to form submission to include image data
    function attachFormSubmitHandler() {
        var form = document.querySelector('form.jotform-form');
        if (!form) return;
        
        // Listen for form submit
        form.addEventListener('submit', function(e) {
            // Check for any blob URLs, external URLs, or images being converted
            var hasBlobs = false;
            var hasExternalUrls = false;
            var hasConverting = false;
            
            if (window.nicEditors && nicEditors.editors) {
                var editors = nicEditors.editors;
                for (var i = 0; i < editors.length; i++) {
                    var editor = editors[i];
                    var instances = editor.nicInstances;
                    if (!instances) continue;
                    for (var j = 0; j < instances.length; j++) {
                        var instance = instances[j];
                        if (instance.elm) {
                            var images = instance.elm.querySelectorAll('img');
                            for (var k = 0; k < images.length; k++) {
                                var img = images[k];
                                var src = (img.src || '').trim();
                                
                                // Check for blob URLs
                                if (src.indexOf('blob:') === 0) {
                                    hasBlobs = true;
                                    logDebug('Found blob URL', { src: src.slice(0, 60) });
                                }
                                
                                // Check for external URLs that need processing
                                if (IMAGE_UPLOAD_ENABLED && /^https?:/i.test(src) && 
                                    src.indexOf(WORKER_URL) !== 0 && 
                                    !img.dataset.imageUploaded && 
                                    !img.dataset.imageUploading) {
                                    hasExternalUrls = true;
                                    logDebug('Found unprocessed external URL', { src: src.slice(0, 60) });
                                }
                                
                                // Check for images currently being converted
                                if (img.dataset.converting === 'true' || img.dataset.imageUploading === 'true') {
                                    hasConverting = true;
                                }
                            }
                        }
                    }
                }
            }
            
            // If blobs detected or external URLs need processing, prevent submit and wait for conversion
            if (hasBlobs || hasExternalUrls || hasConverting) {
                e.preventDefault();
                var reason = hasBlobs ? 'unconverted blobs' : (hasExternalUrls ? 'unprocessed external URLs' : 'images still converting');
                console.warn('BLOCKING SUBMIT: Found ' + reason);
                logDebug('BLOCKING SUBMIT: Found ' + reason);
                
                // Force aggressive conversion with immediate blob conversion
                if (window.nicEditors && nicEditors.editors) {
                    var editors = nicEditors.editors;
                    for (var i = 0; i < editors.length; i++) {
                        var editor = editors[i];
                        var instances = editor.nicInstances;
                        if (!instances) continue;
                        for (var j = 0; j < instances.length; j++) {
                            var instance = instances[j];
                            var textareaId = instance.e ? instance.e.id : null;
                            
                            // Convert all images
                            if (instance.elm) {
                                var images = instance.elm.querySelectorAll('img');
                                for (var k = 0; k < images.length; k++) {
                                    var img = images[k];
                                    var src = (img.src || '').trim();
                                    
                                    // Process blob URLs - IMMEDIATELY
                                    if (src.indexOf('blob:') === 0) {
                                        logDebug('Force converting blob on submit', { src: src.slice(0, 60) });
                                        
                                        // Remove captured class to force reprocessing
                                        img.classList.remove('richtext-captured');
                                        
                                        // Immediate fetch and convert
                                        (function(imgEl, instanceRef, tid) {
                                            fetch(imgEl.src)
                                                .then(function(response) { return response.blob(); })
                                                .then(function(blob) {
                                                    var reader = new FileReader();
                                                    reader.onload = function(e) {
                                                        var dataUrl = e.target.result;
                                                        imgEl.src = dataUrl;
                                                        imgEl.setAttribute('src', dataUrl);
                                                        captureImageData(dataUrl, tid);
                                                        
                                                        if (IMAGE_UPLOAD_ENABLED) {
                                                            uploadToImageHost(imgEl, dataUrl, instanceRef);
                                                        } else {
                                                            persistEditorContent(instanceRef);
                                                        }
                                                    };
                                                    reader.readAsDataURL(blob);
                                                })
                                                .catch(function(err) {
                                                    logDebug('Force conversion failed', err.message);
                                                });
                                        })(img, instance, textareaId);
                                    }
                                    // Process external URLs
                                    else if (IMAGE_UPLOAD_ENABLED && /^https?:/i.test(src) && 
                                             src.indexOf(WORKER_URL) !== 0 && 
                                             !img.dataset.imageUploaded && 
                                             !img.dataset.imageUploading) {
                                        downloadAndConvertImage(img, src, textareaId, instance);
                                    }
                                }
                            }
                        }
                    }
                }
                
                // Wait and retry submit
                var retryCount = 0;
                var checkAndSubmit = function() {
                    retryCount++;
                    var stillHasBlobs = false;
                    var stillHasExternalUrls = false;
                    var stillConverting = false;
                    
                    if (window.nicEditors && nicEditors.editors) {
                        var editors = nicEditors.editors;
                        for (var i = 0; i < editors.length; i++) {
                            var editor = editors[i];
                            var instances = editor.nicInstances;
                            if (!instances) continue;
                            for (var j = 0; j < instances.length; j++) {
                                var instance = instances[j];
                                if (instance.elm) {
                                    var images = instance.elm.querySelectorAll('img');
                                    for (var k = 0; k < images.length; k++) {
                                        var img = images[k];
                                        var src = (img.src || '').trim();
                                        
                                        if (src.indexOf('blob:') === 0) {
                                            stillHasBlobs = true;
                                        }
                                        
                                        if (IMAGE_UPLOAD_ENABLED && /^https?:/i.test(src) && 
                                            src.indexOf(WORKER_URL) !== 0 && 
                                            !img.dataset.imageUploaded && 
                                            !img.dataset.imageUploading) {
                                            stillHasExternalUrls = true;
                                        }
                                        
                                        if (img.dataset.converting === 'true' || img.dataset.imageUploading === 'true') {
                                            stillConverting = true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!stillHasBlobs && !stillHasExternalUrls && !stillConverting && uploadsInProgress === 0) {
                        logDebug('✓ All images processed, submitting form');
                        
                        // Final sync of all editors
                        if (window.nicEditors && nicEditors.editors) {
                            var editors = nicEditors.editors;
                            for (var i = 0; i < editors.length; i++) {
                                var editor = editors[i];
                                var instances = editor.nicInstances;
                                if (!instances) continue;
                                for (var j = 0; j < instances.length; j++) {
                                    var instance = instances[j];
                                    persistEditorContent(instance);
                                    
                                    // Log what's actually in the textarea
                                    if (instance.e && instance.e.tagName === 'TEXTAREA') {
                                        var content = instance.e.value;
                                        var imgCount = (content.match(/<img/gi) || []).length;
                                        var workerUrlCount = (content.match(new RegExp(WORKER_URL, 'g')) || []).length;
                                        logDebug('Final textarea content: ' + imgCount + ' images, ' + workerUrlCount + ' on Cloudflare');
                                        
                                        if (imgCount > 0 && workerUrlCount === 0) {
                                            logDebug('⚠ WARNING: Images present but not on Cloudflare!');
                                        }
                                    }
                                }
                            }
                        }
                        
                        form.submit();
                    } else if (retryCount < 30) {
                        var status = [];
                        if (stillHasBlobs) status.push(countBlobs() + ' blobs');
                        if (stillHasExternalUrls) status.push('external URLs');
                        if (stillConverting) status.push('converting');
                        if (uploadsInProgress > 0) status.push(uploadsInProgress + ' uploads');
                        console.log('⏳ Waiting for images: ' + status.join(', ') + ' (retry ' + retryCount + '/30)');
                        logDebug('Waiting: ' + status.join(', ') + ' (retry ' + retryCount + '/30)');
                        setTimeout(checkAndSubmit, 500);
                    } else {
                        console.warn('⚠ TIMEOUT after 15s - submitting with current state');
                        logDebug('⚠ TIMEOUT after 15s - submitting with current state');
                        
                        // Log what's still pending
                        if (stillHasBlobs) {
                            console.warn('WARNING: ' + countBlobs() + ' blob URLs remain');
                            logDebug('WARNING: ' + countBlobs() + ' blob URLs remain');
                        }
                        if (uploadsInProgress > 0) {
                            console.warn('WARNING: ' + uploadsInProgress + ' uploads incomplete');
                            logDebug('WARNING: ' + uploadsInProgress + ' uploads incomplete');
                        }
                        
                        form.submit();
                    }
                };
                
                function countBlobs() {
                    var count = 0;
                    if (window.nicEditors && nicEditors.editors) {
                        var editors = nicEditors.editors;
                        for (var i = 0; i < editors.length; i++) {
                            var editor = editors[i];
                            var instances = editor.nicInstances;
                            if (!instances) continue;
                            for (var j = 0; j < instances.length; j++) {
                                var instance = instances[j];
                                if (instance.elm) {
                                    var images = instance.elm.querySelectorAll('img');
                                    for (var k = 0; k < images.length; k++) {
                                        var src = (images[k].src || '').trim();
                                        if (src.indexOf('blob:') === 0) count++;
                                    }
                                }
                            }
                        }
                    }
                    return count;
                }
                
                setTimeout(checkAndSubmit, 300);
                return false;
            }
            
            // Wait for image uploads if any are in progress
            if (uploadsInProgress > 0) {
                e.preventDefault();
                logDebug('Waiting for ' + uploadsInProgress + ' image uploads...');
                
                var waitForUploads = function() {
                    if (uploadsInProgress === 0) {
                        logDebug('All uploads complete, submitting form');
                        form.submit();
                    } else {
                        setTimeout(waitForUploads, 500);
                    }
                };
                
                setTimeout(waitForUploads, 100);
                return false;
            }
            // Create hidden input with all pasted images
            var imageDataInput = document.getElementById('richtext_pasted_images');
            if (imageDataInput) {
                imageDataInput.remove();
            }
            
            // Only add if there are images
            var hasImages = false;
            for (var key in pastedImages) {
                if (pastedImages[key] && pastedImages[key].length > 0) {
                    hasImages = true;
                    break;
                }
            }
            
            if (hasImages) {
                imageDataInput = document.createElement('input');
                imageDataInput.type = 'hidden';
                imageDataInput.id = 'richtext_pasted_images';
                imageDataInput.name = 'richtext_pasted_images';
                imageDataInput.value = JSON.stringify(pastedImages);
                form.appendChild(imageDataInput);
                
                logDebug('Submitting form with pasted images', pastedImages);
            }
        });
        
        logDebug('Form submit handler attached for image data');
    }
    
    // Store images in URL parameters for thank you page
    function storeImagesForRedirect() {
        // Store in sessionStorage for retrieval on thank you page
        if (window.sessionStorage) {
            var hasImages = false;
            for (var key in pastedImages) {
                if (pastedImages[key] && pastedImages[key].length > 0) {
                    hasImages = true;
                    break;
                }
            }
            
            if (hasImages) {
                sessionStorage.setItem('jotform_richtext_images', JSON.stringify(pastedImages));
                logDebug('Stored pasted images for thank you page');
            }
        }
    }
    
    // Public API to retrieve stored images (for thank you page)
    window.getStoredRichTextImages = function() {
        if (window.sessionStorage) {
            var stored = sessionStorage.getItem('jotform_richtext_images');
            if (stored) {
                try {
                    return JSON.parse(stored);
                } catch (e) {
                    console.error('Failed to parse stored images:', e);
                }
            }
        }
        return null;
    };
    
    // Clear stored images
    window.clearStoredRichTextImages = function() {
        if (window.sessionStorage) {
            sessionStorage.removeItem('jotform_richtext_images');
        }
    };
    
    // Persist all rich text editors before page navigation
    function persistAllEditors() {
        if (!window.nicEditors || !nicEditors.editors) return;
        
        logDebug('Persisting all editors before navigation');
        
        var editors = nicEditors.editors;
        for (var i = 0; i < editors.length; i++) {
            var editor = editors[i];
            var instances = editor.nicInstances;
            if (!instances) continue;
            
            for (var j = 0; j < instances.length; j++) {
                var instance = instances[j];
                if (instance && instance.elm) {
                    // Convert any remaining blob URLs
                    convertAllImagesToDataUrl(instance, instance.e ? instance.e.id : null);
                    // Persist content to textarea
                    persistEditorContent(instance);
                }
            }
        }
    }
    
    // Attach to page break buttons
    function attachPageNavigationHandlers() {
        // Wait for buttons to be in DOM
        var nextButtons = document.querySelectorAll('.form-pagebreak-next, [class*="pagebreak-next"]');
        var backButtons = document.querySelectorAll('.form-pagebreak-back, [class*="pagebreak-back"]');
        
        if (nextButtons.length === 0 && backButtons.length === 0) {
            // Try again if buttons aren't ready yet
            setTimeout(attachPageNavigationHandlers, 500);
            return;
        }
        
        // Add multiple handlers at different phases to ensure we catch the click
        nextButtons.forEach(function(btn) {
            // Capture phase - runs FIRST before any other handlers
            btn.addEventListener('click', function(e) {
                logDebug('Next button clicked (capture), persisting editors');
                persistAllEditors();
            }, true);
            
            // Bubble phase - runs during normal event flow
            btn.addEventListener('click', function(e) {
                logDebug('Next button clicked (bubble), persisting editors');
                persistAllEditors();
            }, false);
            
            // mousedown - fires before click
            btn.addEventListener('mousedown', function(e) {
                logDebug('Next button mousedown, persisting editors');
                persistAllEditors();
            }, true);
        });
        
        backButtons.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                logDebug('Back button clicked (capture), persisting editors');
                persistAllEditors();
            }, true);
            
            btn.addEventListener('click', function(e) {
                logDebug('Back button clicked (bubble), persisting editors');
                persistAllEditors();
            }, false);
            
            btn.addEventListener('mousedown', function(e) {
                logDebug('Back button mousedown, persisting editors');
                persistAllEditors();
            }, true);
        });
        
        logDebug('Attached multiple handlers to ' + (nextButtons.length + backButtons.length) + ' page navigation buttons');
    }
    
    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init();
            setTimeout(attachFormSubmitHandler, 500);
            setTimeout(attachPageNavigationHandlers, 1000);
        });
    } else {
        init();
        setTimeout(attachFormSubmitHandler, 500);
        setTimeout(attachPageNavigationHandlers, 1000);
    }
    
    // Store images before page unload (in case of redirect)
    window.addEventListener('beforeunload', storeImagesForRedirect);
})();
