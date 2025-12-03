/**
 * Cookie Consent Manager
 * Handles user consent for analytics tracking (Microsoft Clarity)
 */

(function() {
    'use strict';
    
    const CONSENT_COOKIE_NAME = 'jotform_analytics_consent';
    const CONSENT_COOKIE_DAYS = 365;
    
    // Cookie utility functions
    function setCookie(name, value, days) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = name + '=' + value + ';expires=' + expires.toUTCString() + ';path=/;SameSite=Lax';
    }
    
    function getCookie(name) {
        const nameEQ = name + '=';
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
    
    // Check if user has already made a consent choice
    function hasConsent() {
        return getCookie(CONSENT_COOKIE_NAME) === 'true';
    }
    
    function hasDeclined() {
        return getCookie(CONSENT_COOKIE_NAME) === 'false';
    }
    
    function hasChoiceMade() {
        return getCookie(CONSENT_COOKIE_NAME) !== null;
    }
    
    // Initialize Clarity if consent is given
    function initializeClarity() {
        if (window.clarityInitialized) {
            return; // Already initialized
        }
        
        (function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "ucfuj92cyf");
        
        window.clarityInitialized = true;
        
        // Wait for clarity to be ready and set tags
        setTimeout(function() {
            if (typeof window.initClarityTags === 'function') {
                window.initClarityTags();
            }
        }, 100);
        
        if (window.CLARITY_DEBUG) {
            console.log('🍪 Clarity loaded after user consent');
        }
    }
    
    // Accept analytics
    function acceptAnalytics() {
        setCookie(CONSENT_COOKIE_NAME, 'true', CONSENT_COOKIE_DAYS);
        hideBanner();
        initializeClarity();
    }
    
    // Decline analytics
    function declineAnalytics() {
        setCookie(CONSENT_COOKIE_NAME, 'false', CONSENT_COOKIE_DAYS);
        hideBanner();
        
        if (window.CLARITY_DEBUG) {
            console.log('🍪 Analytics declined by user');
        }
    }
    
    // Hide the cookie banner
    function hideBanner() {
        const banner = document.getElementById('cookie-consent-banner');
        if (banner) {
            banner.style.display = 'none';
        }
    }
    
    // Show the cookie banner
    function showBanner() {
        const banner = document.getElementById('cookie-consent-banner');
        if (banner) {
            banner.style.display = 'block';
            // Add animation class
            setTimeout(function() {
                banner.classList.add('visible');
            }, 10);
        }
    }
    
    // Initialize consent management
    function init() {
        // Check if user has already made a choice
        if (hasConsent()) {
            // User accepted - initialize Clarity
            initializeClarity();
        } else if (hasDeclined()) {
            // User declined - do nothing
            if (window.CLARITY_DEBUG) {
                console.log('🍪 Analytics previously declined by user');
            }
        } else {
            // No choice made yet - show banner
            showBanner();
        }
        
        // Set up button event listeners
        const acceptBtn = document.getElementById('cookie-accept-btn');
        const declineBtn = document.getElementById('cookie-decline-btn');
        
        if (acceptBtn) {
            acceptBtn.addEventListener('click', acceptAnalytics);
        }
        
        if (declineBtn) {
            declineBtn.addEventListener('click', declineAnalytics);
        }
    }
    
    // Export functions to window for external access
    window.CookieConsent = {
        init: init,
        hasConsent: hasConsent,
        hasDeclined: hasDeclined,
        acceptAnalytics: acceptAnalytics,
        declineAnalytics: declineAnalytics
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
