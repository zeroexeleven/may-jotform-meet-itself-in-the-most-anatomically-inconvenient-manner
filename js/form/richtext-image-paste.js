/**
 * Rich Text Image Paste Handler
 * Intercepts pasted images and converts them to base64 data URLs
 */

(function() {
    'use strict';
    
    // Store for pasted images per editor
    var pastedImages = {};
    var globalContext = (typeof window !== 'undefined') ? window : {};
    var debugPanelEnabled = (typeof globalContext.RICHTEXT_DEBUG === 'undefined') ? true : !!globalContext.RICHTEXT_DEBUG;
    var debugPanelAnchors = ['top-left', 'bottom-left'];
    var currentAnchorIndex = 0;
    var debugPanelBody = null;
    
    function logDebug(message, data) {
        if (typeof console !== 'undefined' && console.log) {
            console.log('[RichText]', message, data || '');
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
    }
    
    function setupPasteHandlers() {
        if (!window.nicEditors || !nicEditors.editors) return;
        
        var editors = nicEditors.editors;
        for (var i = 0; i < editors.length; i++) {
            var editor = editors[i];
            var instances = editor.nicInstances;
            if (!instances) continue;
            
            for (var j = 0; j < instances.length; j++) {
                var instance = instances[j];
                if (!instance.elm || instance._pasteHandlerAdded) continue;
                attachPasteHandler(instance);
                instance._pasteHandlerAdded = true;
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
            convertAllImagesToDataUrl(instance, textareaId);
            if (originalSave) {
                originalSave();
            }
            persistEditorContent(instance);
        };
        
        var editorElement = instance.elm;
        if (editorElement) {
            var ensureConversion = function() {
                convertAllImagesToDataUrl(instance, textareaId);
            };
            editorElement.addEventListener('blur', ensureConversion);
            editorElement.addEventListener('focusout', ensureConversion);
        }
        
        instance._richtextPersistencePatched = true;
    }

    function convertAllImagesToDataUrl(instance, textareaId) {
        if (!instance || !instance.elm) return;
        var images = instance.elm.querySelectorAll('img');
        for (var i = 0; i < images.length; i++) {
            var img = images[i];
            var src = (img.src || '').trim();
            if (!src || src.indexOf('data:image') === 0) continue;
            convertImageElementToDataUrl(img, instance, textareaId);
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
            persistEditorContent(instance);
        } else if (isBlob) {
            convertImageElementToDataUrl(img, instance, textareaId);
        } else if (isRemote) {
            captureExternalImage(img, textareaId, instance);
        } else {
            // Fallback: attempt in-place conversion
            convertImageElementToDataUrl(img, instance, textareaId);
        }
    }
    

    function convertImageElementToDataUrl(imgElement, instance, textareaId) {
        if (!imgElement) return;
        var src = imgElement.src || '';
        if (!src) return;
        if (imgElement.dataset.converting === 'true') return;
        imgElement.dataset.converting = 'true';
        var cleanup = function() { delete imgElement.dataset.converting; };
        var activeInstance = instance || getInstanceFromElement(imgElement);
        
        var finishWithDataUrl = function(dataUrl) {
            cleanup();
            if (!dataUrl) return;
            applyDataUrlToImage(imgElement, dataUrl, textareaId, activeInstance);
        };
        
        if (src.indexOf('blob:') === 0 && typeof fetch === 'function') {
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
        persistEditorContent(instance);
    }
    
    function persistEditorContent(instance) {
        if (!instance || !instance.elm) return;
        if (instance._isPersisting) return;
        instance._isPersisting = true;
        try {
            if (typeof instance.syncContents === 'function') {
                instance.syncContents();
            } else if (typeof instance.sync === 'function') {
                instance.sync();
            }
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
    
    function captureExternalImage(imgElement, textareaId, instanceRef) {
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
    
    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            init();
            setTimeout(attachFormSubmitHandler, 500);
        });
    } else {
        init();
        setTimeout(attachFormSubmitHandler, 500);
    }
    
    // Store images before page unload (in case of redirect)
    window.addEventListener('beforeunload', storeImagesForRedirect);
})();
