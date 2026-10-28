const measurementId = 'G-LWY6VVZ48V';
const consentKey = 'myebirdmap:analytics-consent';
let loaded = false;

function loadAnalytics() {
  if (loaded) {
    window.dataLayer.push = Array.prototype.push;
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('consent', 'update', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    return;
  }
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });
  window.gtag('config', measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.append(script);
}

export function trackEvent(name, parameters = {}) {
  if (localStorage.getItem(consentKey) === 'granted' && window.gtag)
    window.gtag('event', name, { app_name: 'my_ebird_map', ...parameters });
}

export function initializeAnalyticsChoice() {
  const notice = document.querySelector('#analytics-consent');
  const settings = document.querySelector('#analytics-settings');
  const showNotice = () => {
    document.querySelector('#counting-dialog').close();
    notice.hidden = false;
    document.querySelector('#analytics-accept').focus();
  };
  if (localStorage.getItem(consentKey) === 'granted') loadAnalytics();
  else if (localStorage.getItem(consentKey) !== 'denied') notice.hidden = false;

  document.querySelector('#analytics-accept').onclick = () => {
    localStorage.setItem(consentKey, 'granted');
    notice.hidden = true;
    loadAnalytics();
  };
  document.querySelector('#analytics-decline').onclick = () => {
    localStorage.setItem(consentKey, 'denied');
    notice.hidden = true;
    if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' });
    if (window.dataLayer) window.dataLayer.push = () => 0;
    if (window.gtag) window.gtag = () => {};
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
      document.cookie = `${name}=; Max-Age=0; path=/; domain=.raphaelnussbaumer.com; SameSite=Lax`;
    }
  };
  settings.onclick = showNotice;
}
