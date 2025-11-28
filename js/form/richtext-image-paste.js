/**
 * Rich Text Image Paste Handler
 * Intercepts pasted images and converts them to base64 data URLs
 */

(function() {
    'use strict';
    
    // Store for pasted images per editor
    var pastedImages = {};
    
    function init() {
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
        
        editorElement.addEventListener('paste', function(event) {
            handlePaste(event, instance, textareaId);
        });
    }
    
    function handlePaste(event, instance, textareaId) {
        var clipboardData = event.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;
        
        var items = clipboardData.items;
        var hasImage = false;
        
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            
            // Check if it's an image
            if (item.type.indexOf('image') !== -1) {
                hasImage = true;
                
                var blob = item.getAsFile();
                if (blob) {
                    // Prevent default to avoid any default paste behavior
                    event.preventDefault();
                    event.stopPropagation();
                    processImage(blob, instance, textareaId);
                }
            }
        }
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
                console.log('Image saved for field ' + textareaId + ':', {
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
        
        console.log('Image inserted into editor');
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
                
                console.log('Submitting form with pasted images:', pastedImages);
            }
        });
        
        console.log('Form submit handler attached for image data');
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
                console.log('Stored pasted images in sessionStorage for thank you page');
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
