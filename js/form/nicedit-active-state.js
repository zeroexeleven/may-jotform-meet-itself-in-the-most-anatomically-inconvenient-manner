/**
 * nicEdit Button Active State Fix
 * Overrides nicEdit's button styling to use visible active states
 */

(function() {
    'use strict';
    
    function init() {
        if (typeof nicEditorButton === 'undefined') {
            setTimeout(init, 100);
            return;
        }
        
        // Styling functions
        function applyActiveStyle(border) {
            border.style.backgroundColor = 'rgba(140, 180, 110, 0.95)';
            border.style.border = '2px solid #a5d471';
            border.style.borderRadius = '4px';
            border.style.boxShadow = '0 0 6px rgba(165, 212, 113, 0.8), inset 0 1px 2px rgba(255,255,255,0.3)';
        }
        
        function applyHoverStyle(border) {
            border.style.backgroundColor = 'rgba(140, 180, 110, 0.5)';
            border.style.border = '1px solid rgba(165, 212, 113, 0.7)';
            border.style.borderRadius = '4px';
            border.style.boxShadow = 'none';
        }
        
        function applyDefaultStyle(border) {
            border.style.backgroundColor = '#efefef';
            border.style.border = '1px solid #efefef';
            border.style.borderRadius = '0';
            border.style.boxShadow = 'none';
        }
        
        function applyButtonStyle(btn) {
            if (btn.border) {
                if (btn.isDisabled) {
                    applyDefaultStyle(btn.border);
                } else if (btn.isHover) {
                    applyHoverStyle(btn.border);
                } else if (btn.isActive) {
                    applyActiveStyle(btn.border);
                } else {
                    applyDefaultStyle(btn.border);
                }
            }
        }

        // DOM inspection helpers
        function getCaretElement(instance) {
            var sel = window.getSelection();
            if (!sel || !sel.focusNode) return instance.elm;
            
            var node = sel.focusNode;
            if (node.nodeType === 3) node = node.parentNode;
            
            // Make sure we're inside this editor
            var check = node;
            while (check && check !== document.body) {
                if (check === instance.elm) return node;
                check = check.parentNode;
            }
            return instance.elm;
        }

        function hasAncestorTag(node, tagNames, stopAt) {
            var tags = Array.isArray(tagNames) ? tagNames : [tagNames];
            var current = node;
            while (current && current !== stopAt && current !== document.body) {
                if (current.nodeType === 1 && current.tagName) {
                    var tag = current.tagName.toUpperCase();
                    for (var i = 0; i < tags.length; i++) {
                        if (tag === tags[i].toUpperCase()) return true;
                    }
                }
                current = current.parentNode;
            }
            return false;
        }

        function getBlockParent(node, stopAt) {
            var current = node;
            var blockTags = ['P', 'DIV', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];
            while (current && current !== stopAt && current !== document.body) {
                if (current.nodeType === 1 && current.tagName) {
                    var tag = current.tagName.toUpperCase();
                    for (var i = 0; i < blockTags.length; i++) {
                        if (tag === blockTags[i]) return current;
                    }
                }
                current = current.parentNode;
            }
            return stopAt;
        }

        function detectState(commandName, element, instance) {
            var computed = window.getComputedStyle(element);
            var block = getBlockParent(element, instance.elm);
            var blockComputed = window.getComputedStyle(block);
            
            switch (commandName.toLowerCase()) {
                case 'bold':
                    var weight = computed.fontWeight;
                    var weightNum = parseInt(weight, 10);
                    return weight === 'bold' || weight === 'bolder' || (!isNaN(weightNum) && weightNum >= 600);
                    
                case 'italic':
                    return computed.fontStyle === 'italic' || computed.fontStyle === 'oblique';
                    
                case 'underline':
                    var textDec = computed.textDecorationLine || computed.textDecoration || '';
                    return textDec.indexOf('underline') !== -1;
                    
                case 'strikethrough':
                    var textDecS = computed.textDecorationLine || computed.textDecoration || '';
                    return textDecS.indexOf('line-through') !== -1;
                    
                case 'insertunorderedlist':
                    return hasAncestorTag(element, 'UL', instance.elm);
                    
                case 'insertorderedlist':
                    return hasAncestorTag(element, 'OL', instance.elm);
                    
                case 'createlink':
                    return hasAncestorTag(element, 'A', instance.elm);
                    
                case 'justifyleft':
                    var alignL = blockComputed.textAlign;
                    return alignL === 'left' || alignL === 'start' || alignL === '-webkit-auto';
                    
                case 'justifycenter':
                    return blockComputed.textAlign === 'center';
                    
                case 'justifyright':
                    return blockComputed.textAlign === 'right';
                    
                case 'justifyfull':
                    return blockComputed.textAlign === 'justify';
                    
                default:
                    return false;
            }
        }

        // Sync all toolbar buttons
        function syncAllButtons(editor) {
            if (!editor || !editor.nicPanel || !editor.nicPanel.panelButtons) return;
            
            var instance = editor.selectedInstance || editor.lastSelectedInstance;
            if (!instance || !instance.elm) return;
            
            var element = getCaretElement(instance);
            var buttons = editor.nicPanel.panelButtons;
            
            for (var i = 0; i < buttons.length; i++) {
                var btn = buttons[i];
                if (!btn || !btn.options || !btn.options.command) continue;
                
                try {
                    var state = detectState(btn.options.command, element, instance);
                    btn.isActive = state;
                    applyButtonStyle(btn);
                } catch (e) {
                    // ignore
                }
            }
        }

        // Override updateState
        var originalUpdateState = nicEditorButton.prototype.updateState;
        nicEditorButton.prototype.updateState = function() {
            originalUpdateState.call(this);
            applyButtonStyle(this);
        };

        // Override mouseClick to sync after command
        var originalMouseClick = nicEditorButton.prototype.mouseClick;
        nicEditorButton.prototype.mouseClick = function() {
            var result = originalMouseClick.apply(this, arguments);
            var editor = this.ne;
            
            // Sync immediately and after DOM updates
            setTimeout(function() { syncAllButtons(editor); }, 10);
            setTimeout(function() { syncAllButtons(editor); }, 100);
            setTimeout(function() { syncAllButtons(editor); }, 250);
            
            return result;
        };

        // Override checkNodes for per-button state
        var originalCheckNodes = nicEditorButton.prototype.checkNodes;
        nicEditorButton.prototype.checkNodes = function(node) {
            var instance = this.ne ? (this.ne.selectedInstance || this.ne.lastSelectedInstance) : null;
            
            if (instance && instance.elm && this.options && this.options.command) {
                try {
                    var element = getCaretElement(instance);
                    var state = detectState(this.options.command, element, instance);
                    
                    if (state) {
                        this.activate();
                    } else {
                        this.deactivate();
                    }
                    
                    applyButtonStyle(this);
                    return state;
                } catch (e) {
                    // fall through
                }
            }
            
            var result = originalCheckNodes.call(this, node);
            applyButtonStyle(this);
            return result;
        };

        // Sync on selection changes within editors
        document.addEventListener('selectionchange', function() {
            if (!window.nicEditors || !nicEditors.editors) return;
            var editors = nicEditors.editors;
            for (var i = 0; i < editors.length; i++) {
                var editor = editors[i];
                if (editor.selectedInstance) {
                    syncAllButtons(editor);
                }
            }
        });
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
